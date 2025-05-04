"use client";
import styles from "./page.module.css";
import MagicLinkLogin from "@/components/magiclink-login";
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
        <MagicLinkLogin />
        <Link href="/otp-login" className={styles.link}>
          Go to OTP Login
        </Link>
      </main>
    </div>
  );
}
