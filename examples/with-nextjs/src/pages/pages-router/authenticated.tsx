import { useAuth } from "@scute/react";

const AuthenticatedPage = () => {
  const { session, user, isAuthenticated, isLoading, signOut } = useAuth();

  if (isLoading) {
    return null;
  } else if (!isAuthenticated) {
    return <>unauthenticated</>;
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
      <button onClick={() => signOut()} style={{ marginTop: "1rem" }}>
        Sign Out
      </button>
    </div>
  );
};

export default AuthenticatedPage;
