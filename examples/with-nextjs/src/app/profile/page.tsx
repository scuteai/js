"use client";
import { useAuth, useScuteClient } from "@scute/react-hooks";
import { redirect } from "next/navigation";
import styles from "../page.module.css";

export default function Profile() {
  const { session, user } = useAuth();
  const scuteClient = useScuteClient();

  if (session.status === "unauthenticated") {
    redirect("/");
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className="card" style={{ width: "420px" }}>
          <h5>Profile</h5>
          <pre style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>
            {user ? JSON.stringify(user, null, 2) : "Loading..."}
          </pre>
          <button onClick={() => scuteClient.signOut()}>Sign Out</button>
        </div>
      </main>
    </div>
  );
}
