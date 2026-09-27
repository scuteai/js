// Authorization conditions and data filters, as the Scute API returns them.
//
// A condition is JSON:
//   { "all": [...] } { "any": [...] } { "not": c }
//   { "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in" | "contains" | "starts_with": [a, b] }
//   { "exists": { "var": "resource.x" } }
// where an operand is a literal or { "var": "resource.x" }. A data filter
// (from the filter endpoint) is "all", "none" or a condition over
// `resource.key` (the row key) and `resource.<field>` (row fields).
//
// Missing values use three-valued logic, like SQL NULL: a comparison that
// reads a missing field is "unknown", `not` keeps it unknown, and a row
// matches only when the result is definitely true. The translators below
// keep exactly those semantics.

export type AuthzVar = { var: string };
export type AuthzLiteral = string | number | boolean;
export type AuthzOperand = AuthzVar | AuthzLiteral | AuthzLiteral[];
export type AuthzCondition =
  | { all: AuthzCondition[] }
  | { any: AuthzCondition[] }
  | { not: AuthzCondition }
  | { exists: AuthzVar }
  | { unknown: string }
  | { [op in AuthzComparison]?: [AuthzOperand, AuthzOperand] };
export type AuthzComparison =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "in"
  | "contains"
  | "starts_with";
export type AuthzFilter = "all" | "none" | AuthzCondition;

type Tri = true | false | "unknown";
type Row = Record<string, unknown>;

const isVar = (o: unknown): o is AuthzVar =>
  typeof o === "object" && o !== null && !Array.isArray(o) && "var" in o;

const fieldOf = (v: AuthzVar) => v.var.replace(/^resource\./, "");

const lookup = (row: Row, path: string): unknown => {
  let current: unknown = row;
  for (const part of path.split(".")) {
    if (
      typeof current !== "object" ||
      current === null ||
      !(part in (current as Row))
    ) {
      return undefined;
    }
    current = (current as Row)[part];
  }
  return current;
};

const compare = (op: string, left: unknown, right: unknown): boolean => {
  switch (op) {
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const numbers = typeof left === "number" && typeof right === "number";
      const strings = typeof left === "string" && typeof right === "string";
      if (!numbers && !strings) return false;
      const l = left as number | string;
      const r = right as number | string;
      return op === "lt" ? l < r : op === "lte" ? l <= r : op === "gt" ? l > r : l >= r;
    }
    case "in":
      return Array.isArray(right) && right.includes(left as never);
    case "contains":
      return (
        (Array.isArray(left) && left.includes(right as never)) ||
        (typeof left === "string" &&
          typeof right === "string" &&
          left.includes(right))
      );
    case "starts_with":
      return (
        typeof left === "string" &&
        typeof right === "string" &&
        left.startsWith(right)
      );
    default:
      return false;
  }
};

/**
 * Evaluate a condition against attributes ({ resource: {...}, user: {...} }).
 * Returns true, false or "unknown" (a missing attribute left it open).
 */
export function evaluateCondition(condition: AuthzCondition, attrs: Row): Tri {
  const [op, arg] = Object.entries(condition)[0] as [string, any];
  switch (op) {
    case "all": {
      const parts = (arg as AuthzCondition[]).map((c) => evaluateCondition(c, attrs));
      if (parts.includes(false)) return false;
      return parts.includes("unknown") ? "unknown" : true;
    }
    case "any": {
      const parts = (arg as AuthzCondition[]).map((c) => evaluateCondition(c, attrs));
      if (parts.includes(true)) return true;
      return parts.includes("unknown") ? "unknown" : false;
    }
    case "not": {
      const inner = evaluateCondition(arg, attrs);
      return inner === "unknown" ? "unknown" : !inner;
    }
    case "unknown":
      return "unknown";
    case "exists": {
      const value = lookup(attrs, (arg as AuthzVar).var);
      return value !== undefined && value !== null;
    }
    default: {
      const values = (arg as AuthzOperand[]).map((o) =>
        isVar(o) ? lookup(attrs, o.var) : o
      );
      if (values.some((v) => v === undefined || v === null)) return "unknown";
      return compare(op, values[0], values[1]);
    }
  }
}

/** Does a data filter select this row? Row fields by name, plus `key`. */
export function matchesFilter(filter: AuthzFilter, row: Row): boolean {
  if (filter === "all") return true;
  if (filter === "none") return false;
  return evaluateCondition(filter, { resource: row }) === true;
}

// ── Prisma ────────────────────────────────────────────────────────────

export type PrismaWhereOptions = {
  /** Field that holds the row key (default "id"). */
  key?: string;
  /** Maps condition fields to model fields; unmapped names are used as is. */
  fields?: Record<string, string>;
};

const NOTHING = { OR: [] } as const; // Prisma: an empty OR matches no row

/**
 * Translate a data filter into a Prisma `where`. Prisma can't express
 * "unknown", so each part is split into "definitely true" and "definitely
 * false" forms (a missing value is neither); the result selects the rows
 * where the filter is definitely true, same as the API.
 */
export function toPrismaWhere(
  filter: AuthzFilter,
  options: PrismaWhereOptions = {}
): Record<string, unknown> {
  if (filter === "all") return {};
  if (filter === "none") return NOTHING;
  const field = (v: AuthzVar) => {
    const name = fieldOf(v);
    if (name === "key") return options.key ?? "id";
    return options.fields?.[name] ?? name;
  };
  return prismaTrue(filter, field);
}

type FieldOf = (v: AuthzVar) => string;

function prismaTrue(c: AuthzCondition, field: FieldOf): Record<string, unknown> {
  const [op, arg] = Object.entries(c)[0] as [string, any];
  switch (op) {
    case "all":
      return { AND: (arg as AuthzCondition[]).map((x) => prismaTrue(x, field)) };
    case "any":
      return { OR: (arg as AuthzCondition[]).map((x) => prismaTrue(x, field)) };
    case "not":
      return prismaFalse(arg, field);
    case "unknown":
      return NOTHING;
    case "exists":
      return { [field(arg)]: { not: null } };
    default:
      return prismaCompare(op, arg, field, true);
  }
}

function prismaFalse(c: AuthzCondition, field: FieldOf): Record<string, unknown> {
  const [op, arg] = Object.entries(c)[0] as [string, any];
  switch (op) {
    case "all":
      return { OR: (arg as AuthzCondition[]).map((x) => prismaFalse(x, field)) };
    case "any":
      return { AND: (arg as AuthzCondition[]).map((x) => prismaFalse(x, field)) };
    case "not":
      return prismaTrue(arg, field);
    case "unknown":
      return NOTHING;
    case "exists":
      return { [field(arg)]: null };
    default:
      return prismaCompare(op, arg, field, false);
  }
}

const PRISMA_OPS: Record<string, string> = {
  eq: "equals",
  lt: "lt",
  lte: "lte",
  gt: "gt",
  gte: "gte",
};

// One comparison, definitely true (positive) or definitely false.
function prismaCompare(
  op: string,
  [left, right]: [AuthzOperand, AuthzOperand],
  field: FieldOf,
  positive: boolean
): Record<string, unknown> {
  const vars = [left, right].filter(isVar) as AuthzVar[];
  if (vars.length !== 1) {
    throw new Error(`Can't translate ${op} with ${vars.length} fields to Prisma`);
  }
  const name = field(vars[0]);
  const flip: Record<string, string> = { lt: "gt", lte: "gte", gt: "lt", gte: "lte" };
  // Normalize so the field is on the left.
  let theOp = op;
  let value: unknown = isVar(left) ? right : left;
  if (!isVar(left)) {
    if (op === "contains" && Array.isArray(left)) theOp = "in";
    else if (flip[op]) theOp = flip[op];
    else if (op === "in" || op === "contains" || op === "starts_with") {
      throw new Error(`Can't translate ${op} with the field on the right to Prisma`);
    }
    if (theOp === "in") value = left;
  }

  let test: Record<string, unknown>;
  if (theOp === "ne") test = { NOT: { [name]: { equals: value } } };
  else if (PRISMA_OPS[theOp]) test = { [name]: { [PRISMA_OPS[theOp]]: value } };
  else if (theOp === "in") test = { [name]: { in: value as unknown[] } };
  else if (theOp === "contains") test = { [name]: { contains: value } };
  else if (theOp === "starts_with") test = { [name]: { startsWith: value } };
  else throw new Error(`Can't translate ${op} to Prisma`);

  const present = { [name]: { not: null } };
  // Definitely true: the field is set and the test passes. Definitely
  // false: the field is set and the test fails.
  return positive
    ? { AND: [present, test] }
    : { AND: [present, { NOT: test }] };
}

// ── SQL ───────────────────────────────────────────────────────────────

export type SqlWhereOptions = {
  /** Maps condition fields ("key", "amount") to column SQL. Required: unmapped fields throw. */
  columns: Record<string, string>;
  /** Placeholder for the nth parameter (1-based). Default Postgres style `$1`. */
  placeholder?: (n: number) => string;
};

/**
 * Translate a data filter into a parameterized SQL WHERE fragment.
 * Missing values are SQL NULLs, so SQL's own three-valued logic gives the
 * API's answer. Column names come from `columns` (never from the filter).
 */
export function toSqlWhere(
  filter: AuthzFilter,
  options: SqlWhereOptions
): { sql: string; params: unknown[] } {
  if (filter === "all") return { sql: "TRUE", params: [] };
  if (filter === "none") return { sql: "FALSE", params: [] };
  const params: unknown[] = [];
  const ph = options.placeholder ?? ((n: number) => `$${n}`);
  const bind = (v: unknown) => {
    params.push(v);
    return ph(params.length);
  };
  const column = (v: AuthzVar) => {
    const name = fieldOf(v);
    const col = options.columns[name];
    if (!col) throw new Error(`No column for resource.${name}`);
    return col;
  };
  const operand = (o: AuthzOperand) => (isVar(o) ? column(o) : bind(o));
  const list = (values: AuthzLiteral[]) => values.map(bind).join(", ");

  const node = (c: AuthzCondition): string => {
    const [op, arg] = Object.entries(c)[0] as [string, any];
    const ops: Record<string, string> = { eq: "=", ne: "<>", lt: "<", lte: "<=", gt: ">", gte: ">=" };
    switch (op) {
      case "all":
        return `(${(arg as AuthzCondition[]).map(node).join(" AND ")})`;
      case "any":
        return `(${(arg as AuthzCondition[]).map(node).join(" OR ")})`;
      case "not":
        return `(NOT ${node(arg)})`;
      case "unknown":
        return "(NULL)";
      case "exists":
        return `(${column(arg)} IS NOT NULL)`;
      case "in": {
        const [left, right] = arg;
        if (!Array.isArray(right)) throw new Error("in needs a list");
        return right.length ? `(${operand(left)} IN (${list(right)}))` : "FALSE";
      }
      case "contains": {
        const [left, right] = arg;
        if (Array.isArray(left)) {
          return left.length ? `(${operand(right)} IN (${list(left)}))` : "FALSE";
        }
        return `(strpos(${operand(left)}, ${operand(right)}) > 0)`;
      }
      case "starts_with":
        return `(strpos(${operand(arg[0])}, ${operand(arg[1])}) = 1)`;
      default:
        if (!ops[op]) throw new Error(`Can't translate ${op}`);
        return `(${operand(arg[0])} ${ops[op]} ${operand(arg[1])})`;
    }
  };
  return { sql: node(filter), params };
}
