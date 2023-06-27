import { Auth } from "@scute/ui-react";
import AuthenticatedRoute from "./Authenticated";

export default function WithScuteUI() {
  const { session } = Auth.useAuth();
  const scute = Auth.useScuteClient();

  if (session.status === "authenticated") {
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
      <Auth scuteClient={scute} />
    </div>
  );
}
