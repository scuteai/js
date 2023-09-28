import {
  createServerComponentClient,
  createServerActionClient,
} from "@scute/nextjs";
import { cookies } from "next/headers";

const AuthenticatedPage = async () => {
  const scute = createServerComponentClient({ cookies });

  const {
    data: { session, user },
    error,
  } = await scute.getSession();

  if (error || session.status === "unauthenticated" || !user) {
    return <>unauthenticated</>;
  }

  async function signOutAction() {
    "use server";
    const scute = createServerActionClient({ cookies });
    await scute.signOut();
  }

  return (
    <div style={{ margin: "1rem" }}>
      <pre style={{ fontSize: "12px" }}>
        {JSON.stringify(
          {
            access: session.access,
            expires_at: session.accessExpiresAt,
            user: { id: user.id, email: user.email },
          },
          null,
          4
        )}
      </pre>
      <form action={signOutAction as any}>
        <button type="submit" style={{ marginTop: "1rem" }}>
          Sign Out
        </button>
      </form>
    </div>
  );
};

export default AuthenticatedPage;
