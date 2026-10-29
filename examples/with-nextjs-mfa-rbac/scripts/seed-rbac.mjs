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

const baseUrl = (process.env.NEXT_PUBLIC_SCUTE_BASE_URL || "https://api.scute.io").replace(/\/+$/, "");
const appId = process.env.NEXT_PUBLIC_SCUTE_APP_ID;
const secret = process.env.SCUTE_SECRET;

if (!appId || !secret) {
  console.error("Set NEXT_PUBLIC_SCUTE_APP_ID and SCUTE_SECRET in .env.local (see env.example).");
  process.exit(1);
}

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

async function api(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function fail(what, res) {
  console.error(`${what} failed (${res.status}): ${res.data?.error ?? "no details"}`);
  process.exit(1);
}

// Create, or update when it already exists.
async function upsert(collection, body) {
  const created = await api("POST", collection, body);
  if (created.ok) return "created";
  if (!/taken|exists/i.test(created.data?.error ?? "")) fail(`POST ${collection}`, created);

  const { slug, ...changes } = body;
  const updated = await api("PATCH", `${collection}/${slug}`, changes);
  if (!updated.ok) fail(`PATCH ${collection}/${slug}`, updated);
  return "updated";
}

const authz = `/v1/apps/${appId}/authz`;

console.log(`resource ${RESOURCE.slug}: ${await upsert(`${authz}/resources`, RESOURCE)}`);
for (const r of ROLES) {
  console.log(`role ${r.slug}: ${await upsert(`${authz}/roles`, r)}`);
}

// Step-up: project:edit answers "allow_with_step_up" until the person enters
// a code we email them; one code covers five minutes.
const edit = await api("PATCH", `${authz}/permissions/project:edit`, {
  requires_verification: stepUp,
  verification_method: "email_otp",
  verification_ttl: 300,
});
if (!edit.ok) fail("PATCH project:edit", edit);
console.log(`step-up on project:edit: ${stepUp ? "on" : "off"}`);

// client_checks lets signed-in people ask about their own permissions from
// the browser (useCan), to hide what they can't use. log_allow_rate 1 keeps
// every allow in the decision log, not a 10% sample, so you see each one
// while trying the example.
const settings = await api("PATCH", `${authz}/settings`, { client_checks: true, log_allow_rate: 1 });
if (!settings.ok) fail("PATCH settings", settings);
console.log("client checks: on");

if (role) {
  if (!email) {
    console.error("Give the role and an email: seed-rbac.mjs editor jane@example.com");
    process.exit(1);
  }
  const found = await api("GET", `/v1/${appId}/users?q=${encodeURIComponent(email)}&limit=50`);
  if (!found.ok) fail("Looking up the user", found);
  const user = found.data.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No user ${email} in this app yet. Sign in once with that email, then run this again.`);
    process.exit(1);
  }
  const granted = await api("POST", `${authz}/users/${user.id}/roles`, { role });
  if (!granted.ok) fail(`Giving ${email} the ${role} role`, granted);
  console.log(`${email} is now ${role}`);
}
