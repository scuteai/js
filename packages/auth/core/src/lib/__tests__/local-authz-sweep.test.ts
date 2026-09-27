/**
 * Bug sweep: the local evaluator vs the API engine (app/services/authz.rb,
 * app/services/authz/condition.rb in api-agents). The "API answer" values
 * below were produced by running Authz::Condition#evaluate from api-agents
 * (bundle exec ruby, ruby 3.3.12):
 *
 *   exists context.x (x: nil): true
 *   not exists context.x (x: nil): false
 *   eq context.ch api (ch: nil): false
 *   not eq context.ch api (ch: nil): true
 *   gte user.tags.length 1: :unknown
 *   ne user.tags ["a"] (tags ["a"]): false
 *   eq user.tags ["a"] (tags ["a"]): true
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { decideLocally, type AuthzPolicy } from "../localAuthz";
import { evaluateCondition, matchesFilter, toSqlWhere, type AuthzCondition } from "../authzFilter";

const v = (path: string) => ({ var: path });

const policyWith = (condition: AuthzCondition): AuthzPolicy => ({
  permissions: { "document:edit": { enabled: true } },
  roles: { editor: { permissions: ["document:edit"], conditions: { "document:edit": condition } } },
  resources: { document: { roles: {}, relations: {}, derivations: [] } },
});

describe("exists on an attribute the caller didn't pass (non-strict)", () => {
  // "Unless strict, conditions that read an attribute you didn't pass" must
  // come back unknown/needs_server. The server has the object's stored
  // attributes (resource_attrs) and the user's metadata (user_attrs), so it
  // can know resource.locked_by / user.suspended_at even when the caller
  // didn't pass them.
  it("not exists resource.locked_by on document:42 must ask the server", () => {
    const policy = policyWith({ not: { exists: v("resource.locked_by") } });
    const got = decideLocally(policy, { roles: ["editor"], action: "edit", resource: "document:42" });
    expect(got).toMatchObject({ decision: "unknown", reason: "needs_server" });
  });

  it("not exists user.suspended_at must ask the server", () => {
    const policy = policyWith({ not: { exists: v("user.suspended_at") } });
    const got = decideLocally(policy, { roles: ["editor"], action: "edit", resource: "document" });
    expect(got).toMatchObject({ decision: "unknown", reason: "needs_server" });
  });
});

describe("null values: missing, the same on the API and here", () => {
  it("not exists context.impersonator with impersonator: null -> allow (null is missing)", () => {
    const policy = policyWith({ not: { exists: v("context.impersonator") } });
    const got = decideLocally(policy, {
      roles: ["editor"], action: "edit", resource: "document", context: { impersonator: null }, strict: true,
    });
    expect(got.decision).toBe("allow");
  });

  it("evaluateCondition reads null as missing (exists false, comparisons unknown)", () => {
    const attrs = { context: { x: null, ch: null } };
    expect(evaluateCondition({ exists: v("context.x") }, attrs)).toBe(false);
    expect(evaluateCondition({ not: { eq: [v("context.ch"), "api"] } }, attrs)).toBe("unknown");
  });
});

describe("lookup and comparison semantics", () => {
  it("ne over a list literal: API false, so no grant", () => {
    const policy = policyWith({ ne: [v("user.tags"), ["contractor"]] });
    const got = decideLocally(policy, {
      roles: ["editor"], action: "edit", resource: "document", user: { tags: ["contractor"] }, strict: true,
    });
    expect(got.decision).toBe("deny"); // API: ne -> false => condition_failed
  });

  it("user.teams.length is not an attribute on the API (unknown), so no grant", () => {
    const policy = policyWith({ gte: [v("user.teams.length"), 1] });
    const got = decideLocally(policy, {
      roles: ["editor"], action: "edit", resource: "document", user: { teams: ["a"] }, strict: true,
    });
    expect(got.decision).toBe("deny"); // API: :unknown => deny
  });
});

describe("toSqlWhere: an empty list under NOT", () => {
  // Residual of { not: { in: [resource.region, { var: "user.allowed" }] } }
  // for a user whose `allowed` list is empty.
  const filter: AuthzCondition = { not: { in: [v("resource.region"), []] } };

  const hasSqlite = (() => {
    try {
      execFileSync("sqlite3", ["-version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasSqlite)("selects the same rows as matchesFilter in a real database (rows with a NULL region stay out)", () => {
    const { sql } = toSqlWhere(filter, { columns: { key: "id", region: "region" } });
    const rows = [{ id: "1", region: "eu" }, { id: "2", region: null }];
    const expected = rows.filter((r) => matchesFilter(filter, { key: r.id, region: r.region })).map((r) => r.id);

    const out = execFileSync("sqlite3", [
      ":memory:",
      `create table d(id text, region text); insert into d values ('1','eu'),('2',NULL); select id from d where ${sql} order by id;`,
    ]).toString().trim().split("\n").filter(Boolean);

    expect({ sql, selected: out }).toEqual({ sql, selected: expected });
  });
});
