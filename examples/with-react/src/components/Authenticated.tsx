import { useAuth } from "@scute/react";

const AuthenticatedRoute = () => {
  const { session, user, signOut } = useAuth();

  if (session.status === "loading") {
    return null;
  } else if (session.status === "unauthenticated") {
    return <>unauthenticated</>;
  }

  return (
    <div style={{ margin: "1rem" }}>
      <pre style={{ fontSize: "12px" }}>
        {JSON.stringify({ user, session }, null, 4)}
      </pre>
      <button onClick={() => signOut()} style={{ marginTop: "1rem" }}>
        Sign Out
      </button>
    </div>
  );
};

export default AuthenticatedRoute;
