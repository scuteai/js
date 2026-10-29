// What every settings test uses: the suite's app (its id and secret, from
// the broker), the server operations, the app's settings through the public
// API (as the dashboard changes them), fresh test identities, and steps on
// the sign-in page.

import { expect, test as base, type Page, type Request } from "@playwright/test";
import { loadSettingsEnv } from "./env.mjs";

const loaded = loadSettingsEnv();
const brokerPort = loaded.ok ? loaded.env.brokerPort : 4318;
export const settingsEnv = loaded.ok ? loaded.env : null;

/** The code every test identity gets; nothing is emailed or texted to them. */
export const TEST_CODE = "424242";

/** More API requests than this from one test's page is a loop. */
const MAX_API_REQUESTS = 150;

export type Setup = { apiUrl: string; appId: string; secret: string };

async function broker<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${brokerPort}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`broker ${path}: ${json.error ?? res.status}`);
  return json as T;
}

export class Server {
  constructor(readonly setup: Setup) {}

  async op<T = unknown>(name: string, ...args: unknown[]): Promise<T> {
    const answer = await broker<{ ok: boolean; v?: T; e?: string }>("/op", { op: name, args });
    if (!answer.ok) throw new Error(`server ${name}: ${answer.e}`);
    return answer.v as T;
  }

  /** Back to the suite's defaults (codes, no passkeys, no MFA, no attack protection). */
  reset() {
    return this.op("reset", this.setup.appId);
  }

  /** Attack protection and grace period settings (owner-only routes). */
  set(attrs: Record<string, unknown>) {
    return this.op("set", this.setup.appId, attrs);
  }

  setWorkspace(attrs: Record<string, unknown>) {
    return this.op("set_workspace", this.setup.appId, attrs);
  }

  mintMagicLink(email: string) {
    return this.op<{ id: string; token: string }>("mint_magic_link", this.setup.appId, email);
  }

  blockAllAddresses(on: boolean) {
    return this.op("block_all_addresses", this.setup.appId, on);
  }

  ageMagicLinkClaim(id: string) {
    return this.op<boolean>("age_magic_link_claim", this.setup.appId, id);
  }

  flag(email: string, type: "banned" | "suspended" | "none") {
    return this.op("flag", this.setup.appId, email, type);
  }

  backdate(email: string, days: number) {
    return this.op("backdate", this.setup.appId, email, days);
  }

  userState(email: string) {
    return this.op<{ id: string; status: string; sessions: number; mfa: string[]; trusted_devices: number }>(
      "user_state",
      this.setup.appId,
      email
    );
  }

  sessions(email: string) {
    return this.op<{ type: string; fingerprint: boolean; created_at: string }[]>("sessions", this.setup.appId, email);
  }

  endSessions(email: string) {
    return this.op<number>("end_sessions", this.setup.appId, email);
  }
}

/** The app's settings through PATCH /v1/apps/:id with the app's secret key. */
export class AppSettings {
  constructor(readonly setup: Setup) {}

  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, attempt = 0): Promise<{ status: number; json: any }> {
    const res = await fetch(`${this.setup.apiUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.setup.secret}`, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    // The API's per-IP limits are shared with everything else on this
    // network: wait as long as it asks, twice at most.
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, (Number(json?.retry_after) || 30) * 1000 + 1000));
      return this.call(method, path, body, headers, attempt + 1);
    }
    return { status: res.status, json };
  }

  async update(attrs: Record<string, unknown>) {
    const { status, json } = await this.call("PATCH", `/v1/apps/${this.setup.appId}`, { app: attrs });
    if (status >= 300) throw new Error(`PATCH app: ${status} ${JSON.stringify(json)}`);
    return json;
  }

  /** The admin API (secret key) on one of the app's users. */
  async deactivate(userId: string) {
    const { status, json } = await this.call("POST", `/v1/${this.setup.appId}/users/${userId}/deactivate`);
    if (status >= 300) throw new Error(`deactivate: ${status} ${JSON.stringify(json)}`);
  }

  async read() {
    const { json } = await this.call("GET", `/v1/apps/${this.setup.appId}`);
    return json?.app ?? json;
  }
}

let counter = 0;
const runId = Date.now().toString(36);

/** A new test identity: always gets the code 424242, never emailed. */
export const newEmail = (tag: string) => `e2e-${runId}-${tag}-${++counter}+scute_test@example.com`.toLowerCase();

type Fixtures = { server: Server; settings: AppSettings; setup: Setup; signin: SignInPage };

export const test = base.extend<Fixtures>({
  setup: async ({}, use) => {
    await use(await broker<Setup>("/setup"));
  },
  server: async ({ setup }, use) => {
    const server = new Server(setup);
    await server.reset();
    await use(server);
  },
  settings: async ({ setup }, use) => {
    await use(new AppSettings(setup));
  },
  signin: async ({ page, setup, server }, use, testInfo) => {
    void server; // reset first
    // Every request the page sends to the API: a test that sends more than
    // MAX_API_REQUESTS is looping (a refresh or a poll that never stops).
    let count = 0;
    const byPath = new Map<string, number>();
    page.on("request", (r) => {
      if (!r.url().startsWith(setup.apiUrl)) return;
      count += 1;
      const path = `${r.method()} ${new URL(r.url()).pathname.replace(/\/(ch_|app_)[\w-]+/g, "/$1*")}`;
      byPath.set(path, (byPath.get(path) ?? 0) + 1);
    });
    // The API's per-IP limit (rule api/ip) is shared with everything else on
    // this network: a request it refuses is sent again after the wait it
    // asks for, so other traffic doesn't fail a test. Every other limit (per
    // address, per code) reaches the page as it is.
    await page.route(
      (url) => url.href.startsWith(setup.apiUrl),
      async (route) => {
        try {
          let response = await route.fetch();
          for (let attempt = 0; attempt < 2 && response.status() === 429; attempt++) {
            const body = await response.json().catch(() => null);
            if (body?.rule !== "api/ip") break;
            await new Promise((r) => setTimeout(r, Math.min(Number(body.retry_after) || 30, 65) * 1000 + 500));
            response = await route.fetch();
          }
          await route.fulfill({ response });
        } catch {
          // The page closed with the request in flight (the test ended), or
          // the request failed: let the browser see it as it is.
          await route.continue().catch(() => {});
        }
      }
    );
    await use(new SignInPage(page, setup));
    const top = [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    testInfo.annotations.push({ type: "api requests", description: `${count} (${top.map(([p, n]) => `${p}: ${n}`).join(", ")})` });
    expect(count, `API requests from the page: ${JSON.stringify(top)}`).toBeLessThan(MAX_API_REQUESTS);
  },
});

export { expect };

/** Steps on the test page. */
export class SignInPage {
  constructor(readonly page: Page, readonly setup: Setup) {}

  url(query: Record<string, string> = {}) {
    const q = new URLSearchParams({ app: this.setup.appId, ...query });
    return `/?${q}`;
  }

  async open(query: Record<string, string> = {}) {
    await this.page.goto(this.url(query));
    await expect(this.view()).not.toHaveAttribute("data-scute-view", "loading");
  }

  view() {
    return this.page.locator("[data-scute-view]");
  }

  async expectView(view: string, timeout = 20_000) {
    await expect(this.view()).toHaveAttribute("data-scute-view", view, { timeout });
  }

  session() {
    return this.page.getByTestId("session");
  }

  async expectSignedIn(email?: string) {
    await expect(this.session()).toHaveAttribute("data-state", "signed-in");
    if (email) await expect(this.session()).toHaveAttribute("data-email", email);
  }

  async expectSignedOut() {
    await expect(this.session()).toHaveAttribute("data-state", "signed-out");
  }

  async pace() {
    await broker("/pace", {});
  }

  async submitEmail(email: string) {
    await this.pace();
    await this.page.locator("#scute-signin-email").fill(email);
    await this.page.getByRole("button", { name: "Continue" }).click();
  }

  /** Fill a step's code boxes (they send themselves once full). */
  async typeCode(code: string) {
    await this.view().locator("input").first().fill(code);
  }

  /** Email, then the emailed code. */
  async signInWithCode(email: string) {
    await this.submitEmail(email);
    await this.expectView("otp_input");
    await this.typeCode(TEST_CODE);
  }

  async errorText() {
    return (await this.page.locator("[data-scute-error], [role=alert]").allInnerTexts()).join(" ");
  }

  /** No spinner left on screen after `ms`. */
  async expectNoSpinnerAfter(ms: number) {
    await this.page.waitForTimeout(ms);
    await expect(this.page.locator(".scute-signin__waiting")).toHaveCount(0);
  }

  events(): Promise<string[]> {
    return this.page.evaluate(() => (window as any).__events.slice());
  }

  /** Run code with the page's ScuteClient (window.__scute). */
  client<T>(fn: (client: any, arg: any) => Promise<T> | T, arg?: unknown): Promise<T> {
    return this.page.evaluate(([src, a]) => new Function("c", "a", `return (${src})(c, a)`)((window as any).__scute, a), [
      fn.toString(),
      arg,
    ] as const) as Promise<T>;
  }
}

/**
 * Sending a sign-in link answers with a link made on the server that is
 * not emailed (test identities get codes, never links), so the page waits
 * for a link the test can open.
 */
export async function holdMagicLinks(page: Page, server: Server) {
  const sent: { id: string; token: string }[] = [];
  await page.route(/\/magic_links\/(login|register)$/, async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    const link = await server.mintMagicLink(body.identifier);
    sent.push(link);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ magic_link: { id: link.id }, user_meta_errors: null }) });
  });
  return sent;
}

/** The requests a page sends to the API, for header checks. */
export function recordApiRequests(page: Page, apiUrl: string) {
  const seen: Request[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith(apiUrl)) seen.push(r);
  });
  return seen;
}

// ── MFA factors, set up with the SDK on a signed-in page ──

import { freshTotp } from "./totp";

export type Factors = { totpSecret?: string; lastStep?: number; backupCodes?: string[] };

/** Enroll TOTP (secret from the enrollment, code computed here). */
export async function enrollTotp(signin: SignInPage, factors: Factors) {
  const started = await signin.client((c) =>
    c.enrollMfa({ method: "totp", name: "e2e" }).then((r: any) => ({ data: r.data, error: r.error?.message ?? null }))
  );
  if (started.error || !started.data?.secret) throw new Error(`enrollMfa totp: ${started.error}`);
  const { code, step } = await freshTotp(started.data.secret, factors.lastStep);
  const verified = await signin.client(
    (c, a) => c.verifyMfaEnrollment(a.id, a.code).then((r: any) => r.error?.message ?? null),
    { id: started.data.enrollment.id, code }
  );
  if (verified) throw new Error(`verifyMfaEnrollment totp: ${verified}`);
  factors.totpSecret = started.data.secret;
  factors.lastStep = step;
}

/** Enroll the person's own (test identity) email: its code is 424242. */
export async function enrollEmail(signin: SignInPage, email: string) {
  const started = await signin.client(
    (c, e) => c.enrollMfa({ method: "email", secret_data: e }).then((r: any) => ({ data: r.data, error: r.error?.message ?? null })),
    email
  );
  if (started.error) throw new Error(`enrollMfa email: ${started.error}`);
  const verified = await signin.client(
    (c, a) => c.verifyMfaEnrollment(a.id, a.code).then((r: any) => r.error?.message ?? null),
    { id: started.data.enrollment.id, code: TEST_CODE }
  );
  if (verified) throw new Error(`verifyMfaEnrollment email: ${verified}`);
}

export async function makeBackupCodes(signin: SignInPage, factors: Factors) {
  const made = await signin.client((c) =>
    c.generateBackupCodes().then((r: any) => ({ codes: r.data?.backup_codes ?? null, error: r.error?.message ?? null }))
  );
  if (!made.codes) throw new Error(`generateBackupCodes: ${made.error}`);
  factors.backupCodes = made.codes;
}

/** The next TOTP code, never one already used. */
export async function nextTotp(factors: Factors) {
  const { code, step } = await freshTotp(factors.totpSecret!, factors.lastStep);
  factors.lastStep = step;
  return code;
}

/** The page holds no session at all: nothing in storage, getSession says so. */
export async function expectNoSession(signin: SignInPage) {
  const status = await signin.client((c) => c.getSession().then((r: any) => r.data?.session?.status ?? "none"));
  expect(status).not.toBe("authenticated");
  const stored = await signin.page.evaluate(() =>
    [...Object.keys(localStorage), ...document.cookie.split(";").map((c) => c.split("=")[0].trim())].filter((k) =>
      /access|refresh/i.test(k)
    )
  );
  expect(stored).toEqual([]);
}
