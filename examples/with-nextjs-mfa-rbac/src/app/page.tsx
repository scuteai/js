import Link from "next/link";
import { getSignedInUser } from "@/lib/session";

export default async function Home() {
  const user = await getSignedInUser();

  return (
    <section className="stack">
      <h1>Scute MFA and RBAC example</h1>
      <p>
        Sign in with Scute&apos;s drop-in <code>ScuteSignIn</code>, set up a second step on your account,
        and sign in again with it. On the projects page, Scute roles decide who may view and who may edit,
        checked on the server.
      </p>
      {user ? (
        <p>
          Signed in as <strong>{user.email}</strong>. Go to your <Link href="/account">account</Link> to set up
          two-step verification, or to <Link href="/projects">projects</Link> to see what your role allows.
        </p>
      ) : (
        <ul className="list">
          <li>
            <Link href="/sign-in">Sign in</Link> with the drop-in component.
          </li>
          <li>
            <Link href="/sign-in/custom">Sign in with a custom second step</Link>: the same flow, with the MFA
            step drawn by this app (headless).
          </li>
        </ul>
      )}
    </section>
  );
}
