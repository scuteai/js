// State shared by the live tests in one run: the run id and the names built
// from it, the test identities, the signed-in clients, and what to delete at
// the end. Everything this suite makes is named live-<runid>-... and is
// deleted in afterAll, even when a test failed.

import { randomBytes } from "node:crypto";
import { ScuteAdminApi, ScuteClient, type ScuteTokenPayload } from "@scute/js-core";
import type { LiveEnv } from "../env";
import { describeError } from "./check";
import { Api } from "./http";

/** The code every test identity gets (and the only code this suite may print). */
export const TEST_CODE = "424242";

export type SignedIn = { id: string; identifier: string; client: ScuteClient; payload?: ScuteTokenPayload };

type Task = { phase: number; what: string; fn: () => Promise<unknown> };

/** Cleanup steps, run in phase order; one failing never stops the others. */
export class Cleanup {
  private readonly tasks: Task[] = [];

  add(phase: number, what: string, fn: () => Promise<unknown>) {
    this.tasks.push({ phase, what, fn });
  }

  async run(): Promise<string[]> {
    const failures: string[] = [];
    const ordered = [...this.tasks].sort((a, b) => a.phase - b.phase);
    for (const task of ordered) {
      try {
        await task.fn();
      } catch (e) {
        failures.push(`${task.what}: ${describeError(e)}`);
      }
    }
    return failures;
  }
}

export const PHASE = {
  impersonations: 10,
  oauth: 20,
  agents: 30,
  properties: 40,
  roleAssignments: 50,
  roles: 60,
  resources: 70,
  users: 80,
  settings: 90,
} as const;

export class LiveContext {
  readonly api: Api;
  readonly admin: ScuteAdminApi;
  readonly runId: string;
  /** live-<runid>: every slug and name this run makes starts with it. */
  readonly prefix: string;
  readonly startedAt = new Date();
  readonly cleanup = new Cleanup();
  /** +1 201 555 01xx, this suite's phone range. */
  readonly phone: string;

  /** What earlier tests produced, for the ones after them. */
  readonly state: {
    main?: SignedIn;
    phone?: SignedIn;
    mfa?: SignedIn & { secret?: string; enrollmentId?: string; lastStep?: number; backupCodes?: string[]; completedChallenge?: string };
    second?: { id: string; email: string };
    policyImported?: boolean;
    agents: Record<string, boolean>;
    properties: Record<string, boolean>;
    conversationId?: string;
    oauthAccessToken?: string;
  } = { agents: {}, properties: {} };

  private readonly trackedUsers = new Set<string>();

  constructor(readonly env: LiveEnv) {
    this.api = new Api(env);
    this.admin = new ScuteAdminApi({ appId: env.appId, baseUrl: env.baseUrl, secretKey: env.secret });
    this.runId = `${Date.now().toString(36).slice(-5)}${randomBytes(2).toString("hex").slice(0, 3)}`;
    this.prefix = `live-${this.runId}`;
    this.phone = `+120155501${String(randomBytes(1)[0] % 100).padStart(2, "0")}`;
  }

  /** live-js-<runid>-<n>+scute_test@example.com */
  email(n: string | number): string {
    return `live-js-${this.runId}-${n}+scute_test@example.com`;
  }

  /** A client like a browser has: the app id, no secret, its own in-memory session. */
  newClient(): ScuteClient {
    return new ScuteClient({ appId: this.env.appId, baseUrl: this.env.baseUrl });
  }

  // ── Names ──

  get resource() {
    return `${this.prefix}-doc`;
  }

  perm(action: string) {
    return `${this.resource}:${action}`;
  }

  role(name: "viewer" | "editor" | "regional" | "everyone" | "agent") {
    return `${this.prefix}-${name}`;
  }

  agent(name: string) {
    return `${this.prefix}-${name}`;
  }

  // ── Cleanup registration ──

  /** Delete this user at the end (after taking back the roles this run gave them). */
  trackUser(id: string) {
    if (this.trackedUsers.has(id)) return;
    this.trackedUsers.add(id);
    // No SDK method for a user's role assignments: GET/DELETE /v1/apps/:app_id/authz/users/:id/roles.
    this.cleanup.add(PHASE.roleAssignments, `take back roles of user ${id}`, async () => {
      const { data } = await this.api.get<{ roles: { role: string }[] }>(`${this.api.appPath}/authz/users/${id}/roles`, {
        expect: [200, 404],
      });
      for (const grant of data?.roles ?? []) {
        if (grant.role.startsWith(this.prefix)) {
          await this.api.delete(`${this.api.appPath}/authz/users/${id}/roles/${encodeURIComponent(grant.role)}`, { expect: [204, 404] });
        }
      }
    });
    this.cleanup.add(PHASE.impersonations, `end sessions as user ${id}`, async () => {
      const { error } = await this.admin.stopImpersonating(id);
      if (error && (error as { code?: number }).code !== 404) throw error;
    });
    this.cleanup.add(PHASE.users, `delete user ${id}`, async () => {
      const { error } = await this.admin.deleteUser(id);
      if (error && (error as { code?: number }).code !== 404) throw error;
    });
  }

  /**
   * Sweeps by prefix, registered once at the start so they run even when the
   * test that makes the thing failed halfway. The SDKs have no methods for
   * any of these (agents, properties, roles, resources).
   */
  registerSweeps() {
    const { api, prefix } = this;
    this.cleanup.add(PHASE.agents, "delete this run's agents", async () => {
      const { data } = await api.get<{ agents: { slug: string }[] }>(`${api.appPath}/authz/agents`);
      for (const a of data.agents ?? []) {
        if (a.slug.startsWith(prefix)) await api.delete(`${api.appPath}/authz/agents/${a.slug}`, { expect: [204, 404] });
      }
    });
    this.cleanup.add(PHASE.properties, "delete this run's properties", async () => {
      const { data } = await api.get<{ properties: { name: string }[] }>(`${api.appPath}/properties`);
      for (const p of data.properties ?? []) {
        if (p.name.startsWith(prefix)) await api.delete(`${api.appPath}/properties/${p.name}`, { expect: [204, 404] });
      }
    });
    this.cleanup.add(PHASE.roles, "delete this run's roles", async () => {
      const { data } = await api.get<{ roles: { slug: string }[] }>(`${api.appPath}/authz/roles`);
      for (const r of data.roles ?? []) {
        if (r.slug.startsWith(prefix)) await api.delete(`${api.appPath}/authz/roles/${r.slug}`, { expect: [204, 404] });
      }
    });
    this.cleanup.add(PHASE.resources, "delete this run's resources", async () => {
      const { data } = await api.get<{ resources: { slug: string }[] }>(`${api.appPath}/authz/resources`);
      for (const r of data.resources ?? []) {
        if (r.slug.startsWith(prefix)) {
          await api.delete(`${api.appPath}/authz/resources/${r.slug}`, { query: { force: "true" }, expect: [204, 404] });
        }
      }
    });
  }

  async tearDown(): Promise<void> {
    const failures = await this.cleanup.run();
    if (failures.length) {
      // Names and API error codes only.
      console.warn(`[scute live] cleanup left ${failures.length} thing(s) behind for run ${this.runId}:\n  ${failures.join("\n  ")}`);
    }
  }
}
