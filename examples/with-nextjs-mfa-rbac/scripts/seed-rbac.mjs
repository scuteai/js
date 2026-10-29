// Sets up this app's roles and permissions in Scute, with your secret key.
// Safe to run again: what already exists is updated.
//
//   node --env-file=.env.local scripts/seed-rbac.mjs
//       the policy: two permissions and two roles
//   node --env-file=.env.local scripts/seed-rbac.mjs editor jane@example.com
//       the same, then gives jane@example.com the editor role (she must
//       have signed in once)
//   node --env-file=.env.local scripts/seed-rbac.mjs --step-up
//       the same, and editing a project asks for a fresh email code first

import { ScuteAdminApi } from "@scute/nextjs-handlers";

const baseUrl = (process.env.NEXT_PUBLIC_SCUTE_BASE_URL || "https://api.scute.io").replace(/\/+$/, "");
const appId = process.env.NEXT_PUBLIC_SCUTE_APP_ID;
const secret = process.env.SCUTE_SECRET;

if (!appId || !secret) {
  console.error("Set NEXT_PUBLIC_SCUTE_APP_ID and SCUTE_SECRET in .env.local (see env.example).");
  process.exit(1);
}

const admin = new ScuteAdminApi({ appId, baseUrl, secretKey: secret });

const args = process.argv.slice(2);
const stepUp = args.includes("--step-up");
const [role, email] = args.filter((a) => !a.startsWith("--"));

// A resource with two actions makes two permissions: project:view and
// project:edit.
const RESOURCE = { slug: "project", name: "Project", actions: ["view", "edit"] };

const ROLES = [
  // A default role: everyone who signs in holds it.
  { slug: "viewer", name: "Viewer", is_default: true, permissions: ["project:view"] },
  { slug: "editor", name: "Editor", is_default: false, permissions: ["project:view", "project:edit"] },
];

// Every helper answers { data, error }; error.json is the API's answer.
const reason = (error) => error?.json?.error ?? error?.message ?? "no details";

function fail(what, error) {
  console.error(`${what} failed (${error?.code ?? "no response"}): ${reason(error)}`);
  process.exit(1);
}

// Create, or update when it already exists.
async function upsert(what, create, update) {
  const created = await create();
  if (!created.error) return "created";
  if (!/taken|exists/i.test(reason(created.error))) fail(`Creating ${what}`, created.error);

  const updated = await update();
  if (updated.error) fail(`Updating ${what}`, updated.error);
  return "updated";
}

{
  const { slug, ...changes } = RESOURCE;
  const done = await upsert(
    `resource ${slug}`,
    () => admin.authzCreateResource(RESOURCE),
    () => admin.authzUpdateResource(slug, changes)
  );
  console.log(`resource ${slug}: ${done}`);
}
for (const r of ROLES) {
  const { slug, ...changes } = r;
  const done = await upsert(
    `role ${slug}`,
    () => admin.authzCreateRole(r),
    () => admin.authzUpdateRole(slug, changes)
  );
  console.log(`role ${slug}: ${done}`);
}

// Step-up: project:edit answers "allow_with_step_up" until the person enters
// a code we email them; one code covers five minutes.
const edit = await admin.authzUpdatePermission("project:edit", {
  requires_verification: stepUp,
  verification_method: "email_otp",
  verification_ttl: 300,
});
if (edit.error) fail("Updating project:edit", edit.error);
console.log(`step-up on project:edit: ${stepUp ? "on" : "off"}`);

// client_checks lets signed-in people ask about their own permissions from
// the browser (useCan), to hide what they can't use. log_allow_rate 1 keeps
// every allow in the decision log, not a 10% sample, so you see each one
// while trying the example.
const settings = await admin.authzUpdateSettings({ client_checks: true, log_allow_rate: 1 });
if (settings.error) fail("Updating settings", settings.error);
console.log("client checks: on");

if (role) {
  if (!email) {
    console.error("Give the role and an email: seed-rbac.mjs editor jane@example.com");
    process.exit(1);
  }
  const found = await admin.listUsers({ email: email.toLowerCase(), limit: 50 });
  if (found.error) fail("Looking up the user", found.error);
  const user = found.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No user ${email} in this app yet. Sign in once with that email, then run this again.`);
    process.exit(1);
  }
  const granted = await admin.authzAssignRole(user.id, role);
  if (granted.error) fail(`Giving ${email} the ${role} role`, granted.error);
  console.log(`${email} is now ${role}`);
}
