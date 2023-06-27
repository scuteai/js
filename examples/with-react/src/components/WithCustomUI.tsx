import { type FormEventHandler, useEffect, useState } from "react";
import { useAuth, useScuteClient } from "@scute/react";
import AuthenticatedRoute from "./Authenticated";

export default function WithCustomUI() {
  const { session } = useAuth();
  const scuteClient = useScuteClient();
  const [scene, setScene] = useState<"sign_up" | "sign_in" | (string & {})>(
    "sign_up"
  );

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const email = (e.target as any).email.value;

    if (scene === "sign_in") {
      await scuteClient.signInWithEmail(email);
    } else {
      await scuteClient.signUpWithEmail(email);
    }
  };

  useEffect(() => {
    const unsubscribe = scuteClient.onAuthStateChange((event) => {
      if (event === "magic_pending") {
        setScene("magic_pending");
      } else if (event === "magic_loading") {
        setScene("magic_loading");
        setTimeout(() => {
          setScene("sign_in");
        }, 500);
      }
    });

    return () => unsubscribe();
  }, []);

  if (session.status === "loading") {
    return null;
  } else if (scene === "magic_loading") {
    return <div>Wait you are logging in with some magic!</div>;
  } else if (scene === "magic_pending") {
    return <div>Pending...</div>;
  }

  if (session.status === "authenticated") {
    return <AuthenticatedRoute />;
  }

  return (
    <form onSubmit={handleSubmit} style={{ margin: "1rem" }}>
      <input type="email" placeholder="email" name="email" />
      <br />
      <button type="submit">Continue</button>
      <br />
      <span
        onClick={() => setScene(scene === "sign_up" ? "sign_in" : "sign_up")}
        style={{ textDecoration: "underline", cursor: "pointer" }}
      >
        {scene === "sign_up" ? "sign in" : "sign up"} instead
      </span>
    </form>
  );
}
