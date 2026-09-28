// The JS SDKs against a real Scute API (DX-08). One file, run in order:
// later blocks use what earlier ones signed in or made. Without credentials
// every test is skipped (global-setup.ts says why, in one line).

import { afterAll, beforeAll, describe, inject } from "vitest";
import { loadEnv } from "./env";
import { LiveContext } from "./lib/context";
import { accountsSuite } from "./suites/accounts";
import { agentsSuite } from "./suites/agents";
import { appSuite } from "./suites/app";
import { authMcpSuite } from "./suites/auth-mcp";
import { authzSuite } from "./suites/authz";
import { decisionLogSuite } from "./suites/decision-log";
import { gatewaySuite } from "./suites/gateway";
import { impersonationSuite } from "./suites/impersonation";
import { mfaSuite } from "./suites/mfa";
import { sessionsSuite } from "./suites/sessions";
import { signInSuite } from "./suites/signin";
import { usersSuite } from "./suites/users";

const loaded = loadEnv();
const ctx = loaded.ok ? new LiveContext(loaded.env) : undefined;
const get = () => {
  if (!ctx) throw new Error("the live suite has no credentials");
  return ctx;
};

describe.skipIf(!ctx)("Scute JS SDKs, live", () => {
  beforeAll(() => {
    // Prefix sweeps first, so they run even when the test that makes the thing fails halfway.
    get().registerSweeps();
  });

  afterAll(async () => {
    await get().tearDown(inject("summaryFile"));
  });

  appSuite(get);
  signInSuite(get);
  usersSuite(get);
  authzSuite(get);
  accountsSuite(get);
  impersonationSuite(get);
  agentsSuite(get);
  authMcpSuite(get);
  gatewaySuite(get);
  mfaSuite(get);
  sessionsSuite(get);
  decisionLogSuite(get);
});
