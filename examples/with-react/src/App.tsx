import { Auth } from "@scute/auth-ui-react";
import AuthenticatedRoute from "./components/Authenticated";
import { scuteClient } from "./scute";

export default function App() {
  const { session } = Auth.useAuth();

  if (session.status === "authenticated") {
    //@ts-ignore
    return <AuthenticatedRoute />;
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <Auth scuteClient={scuteClient} />
    </div>
  );
}
