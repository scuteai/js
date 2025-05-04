"use client";
import styles from "./page.module.css";
import SignInOrUp from "@/components/sign-in-or-up";
import { useEffect } from "react";
import { useScuteClient } from "@scute/react-hooks";
import { redirect } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const scuteClient = useScuteClient();
  useEffect(() => {
    const getSession = async () => {
      const { data } = await scuteClient.getAuthToken();
      // If user is already logged in, redirect to profile
      if (data?.access) {
        return redirect("/profile");
      }
    };
    getSession();
  }, [scuteClient]);
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <SignInOrUp />
      </main>
    </div>
  );
}
