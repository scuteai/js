/**
 * Authorization conditions and data-filter translators. The Prisma
 * translator is checked against a small evaluator of the Prisma `where`
 * subset it emits (with SQL's rule that a comparison on a NULL field never
 * matches), across random filters and rows: whatever Prisma would select
 * must be exactly the rows the filter matches.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  matchesFilter,
  toPrismaWhere,
  toSqlWhere,
  type AuthzCondition,
} from "../authzFilter";

const v = (path: string) => ({ var: path });

describe("evaluateCondition", () => {
  const attrs = {
    user: { region: "eu", tags: ["finance", "ops"] },
    resource: { region: "eu", amount: 4200, team: "fin-ops" },
  };

  it("compares, combines and negates", () => {
    expect(evaluateCondition({ eq: [v("user.region"), v("resource.region")] }, attrs)).toBe(true);
    expect(evaluateCondition({ lt: [v("resource.amount"), 5000] }, attrs)).toBe(true);
    expect(evaluateCondition({ contains: [v("user.tags"), "ops"] }, attrs)).toBe(true);
    expect(evaluateCondition({ starts_with: [v("resource.team"), "fin"] }, attrs)).toBe(true);
    expect(evaluateCondition({ not: { in: [v("resource.region"), ["us"]] } }, attrs)).toBe(true);
  });

  it("treats mismatched types as false", () => {
    expect(evaluateCondition({ lt: [v("resource.team"), 5] }, attrs)).toBe(false);
  });

  it("uses three-valued logic for missing values", () => {
    const missing = { eq: [v("user.department"), "ops"] } as AuthzCondition;
    expect(evaluateCondition(missing, attrs)).toBe("unknown");
    expect(evaluateCondition({ not: missing }, attrs)).toBe("unknown");
    expect(evaluateCondition({ any: [missing, { eq: [v("user.region"), "eu"] }] }, attrs)).toBe(true);
    expect(evaluateCondition({ all: [missing, { eq: [v("user.region"), "us"] }] }, attrs)).toBe(false);
    expect(evaluateCondition({ exists: v("user.department") }, attrs)).toBe(false);
  });
});

// ── A Prisma `where` evaluator for the subset toPrismaWhere emits ──

type Row = Record<string, unknown>;

function prismaMatches(where: any, row: Row): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "AND") return (value as any[]).every((w) => prismaMatches(w, row));
    if (key === "OR") return (value as any[]).some((w) => prismaMatches(w, row));
    if (key === "NOT") return !prismaMatches(value, row);
    return fieldMatches(row[key], value);
  });
}

function fieldMatches(actual: unknown, filter: any): boolean {
  if (filter === null) return actual === null || actual === undefined;
  return Object.entries(filter).every(([op, expected]: [string, any]) => {
    if (op === "not" && expected === null) return actual !== null && actual !== undefined;
    if (actual === null || actual === undefined) return false; // SQL: NULL never matches
    switch (op) {
      case "equals":
        return actual === expected;
      case "lt":
        return sameType(actual, expected) && (actual as any) < expected;
      case "lte":
        return sameType(actual, expected) && (actual as any) <= expected;
      case "gt":
        return sameType(actual, expected) && (actual as any) > expected;
      case "gte":
        return sameType(actual, expected) && (actual as any) >= expected;
      case "in":
        return (expected as unknown[]).includes(actual);
      case "contains":
        return typeof actual === "string" && actual.includes(expected);
      case "startsWith":
        return typeof actual === "string" && actual.startsWith(expected);
      default:
        throw new Error(`evaluator doesn't know ${op}`);
    }
  });
}

const sameType = (a: unknown, b: unknown) => typeof a === typeof b;

// ── Random filters and rows ──

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];

function randomFilter(r: () => number, depth: number): AuthzCondition {
  const fields = [v("resource.region"), v("resource.amount"), v("resource.team"), v("resource.key")];
  const choice = depth > 0 ? Math.floor(r() * 6) : 5;
  switch (choice) {
    case 0:
      return { all: [randomFilter(r, depth - 1), randomFilter(r, depth - 1)] };
    case 1:
      return { any: [randomFilter(r, depth - 1), randomFilter(r, depth - 1)] };
    case 2:
      return { not: randomFilter(r, depth - 1) };
    case 3:
      return { exists: pick(r, fields) };
    case 4:
      return r() < 0.2 ? { unknown: "attribute" } : { in: [v("resource.key"), pick(r, [["a", "b"], ["c"], []])] };
    default: {
      const op = pick(r, ["eq", "ne", "lt", "lte", "gt", "gte", "starts_with", "contains"]);
      if (op === "starts_with" || op === "contains") {
        return r() < 0.5 && op === "contains"
          ? { contains: [["eu", "us"], v("resource.region")] }
          : ({ [op]: [v("resource.team"), pick(r, ["fin", "ops", "x"])] } as AuthzCondition);
      }
      const field = pick(r, fields);
      const value =
        field.var === "resource.amount" ? pick(r, [100, 4200, 9000]) : pick(r, ["eu", "us", "fin-ops", "a"]);
      return (r() < 0.5 ? { [op]: [field, value] } : { [op]: [value, field] }) as AuthzCondition;
    }
  }
}

function randomRow(r: () => number, i: number): Row {
  return {
    key: pick(r, ["a", "b", "c", "d"]) + i,
    region: pick(r, ["eu", "us", null, undefined]),
    amount: pick(r, [100, 4200, 9000, null]),
    team: pick(r, ["fin-ops", "ops", "finance", null]),
  };
}

describe("toPrismaWhere", () => {
  it("selects exactly the rows the filter matches (fuzz)", () => {
    const r = rng(20260927);
    const seen = { matched: 0, missed: 0 };
    for (let n = 0; n < 500; n++) {
      const filter = randomFilter(r, 3);
      const where = toPrismaWhere(filter, { key: "key" });
      for (let i = 0; i < 12; i++) {
        const row = randomRow(r, i);
        const expected = matchesFilter(filter, row);
        seen[expected ? "matched" : "missed"]++;
        expect(prismaMatches(where, row), JSON.stringify({ filter, row })).toBe(expected);
      }
    }
    // Not vacuous: plenty of both outcomes.
    expect(seen.matched).toBeGreaterThan(500);
    expect(seen.missed).toBeGreaterThan(500);
  });

  it("handles all and none", () => {
    expect(toPrismaWhere("all")).toEqual({});
    expect(prismaMatches(toPrismaWhere("none"), { id: "1" })).toBe(false);
  });

  it("maps the key and fields", () => {
    const where = toPrismaWhere(
      { any: [{ in: [v("resource.key"), ["42"]] }, { eq: [v("resource.region"), "eu"] }] },
      { key: "documentId", fields: { region: "ownerRegion" } }
    );
    expect(JSON.stringify(where)).toContain('"documentId"');
    expect(JSON.stringify(where)).toContain('"ownerRegion"');
  });
});

describe("toSqlWhere", () => {
  it("parameterizes values and takes columns only from the mapping", () => {
    const { sql, params } = toSqlWhere(
      {
        any: [
          { in: [v("resource.key"), ["42", "43"]] },
          { all: [{ lt: [v("resource.amount"), 5000] }, { not: { unknown: "attribute" } }] },
        ],
      },
      { columns: { key: "d.id", amount: "d.amount" } }
    );
    expect(sql).toBe("((d.id IN ($1, $2)) OR ((d.amount < $3) AND (NOT (NULL))))");
    expect(params).toEqual(["42", "43", 5000]);
  });

  it("refuses fields without a column", () => {
    expect(() => toSqlWhere({ exists: v("resource.secret") }, { columns: {} })).toThrow(/No column/);
  });

  it("supports other placeholder styles and constants", () => {
    const { sql } = toSqlWhere({ eq: [v("resource.team"), "ops"] }, { columns: { team: "team" }, placeholder: () => "?" });
    expect(sql).toBe("(team = ?)");
    expect(toSqlWhere("all", { columns: {} }).sql).toBe("TRUE");
    expect(toSqlWhere({ in: [v("resource.key"), []] }, { columns: { key: "id" } }).sql).toBe("FALSE");
  });
});
