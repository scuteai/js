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
            {user
              ? JSON.stringify({ ...user, sessions: "[...]" }, null, 2)
              : "Loading..."}
          </pre>
          <button onClick={() => scuteClient.signOut()}>Sign Out</button>
        </div>
        <div style={{ width: "420px" }}>
          <h5>Sessions</h5>
          <ul style={{ textAlign: "left" }}>
            {user?.sessions
              ? user?.sessions.map((session) => (
                  <li
                    className="card"
                    style={{
                      width: "420px",
                      textAlign: "left",
                      padding: "10px",
                      margin: "10px",
                    }}
                    key={session.id}
                  >
                    <p>{session.id}</p>
                    <pre style={{ whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(session, null, 2)}
                    </pre>
                    <p>
                      <button
                        onClick={() =>
                          scuteClient.revokeSession(session.id).then(() => {
                            window.location.reload();
                          })
                        }
                      >
                        Delete Session
                      </button>
                    </p>
                  </li>
                ))
              : "Loading..."}
          </ul>
        </div>
      </main>
    </div>
  );
}
