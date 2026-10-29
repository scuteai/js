import { requireUser } from "@/lib/session";
import { SecuritySettings } from "./security-settings";

// A protected page: the session is checked on the server, before anything
// renders. Signed out, the visitor is sent to /sign-in?next=/account.
export default async function AccountPage() {
  const user = await requireUser("/account");

  return (
    <section className="stack">
      <h1>Your account</h1>
      <dl className="facts">
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>User ID</dt>
        <dd>
          <code>{user.id}</code>
        </dd>
        <dt>Signed up</dt>
        <dd>{new Date(user.signup_date).toLocaleDateString()}</dd>
      </dl>

      <h2>Two-step verification</h2>
      <SecuritySettings email={user.email ?? ""} />
    </section>
  );
}
