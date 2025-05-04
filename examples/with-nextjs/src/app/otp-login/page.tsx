"use client";
import OtpLogin from "@/components/otp-login";
import styles from "../page.module.css";
import { useEffect } from "react";
import { useScuteClient } from "@scute/react-hooks";
import { redirect } from "next/navigation";
import Link from "next/link";

export default function OtpLoginPage() {
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
        <OtpLogin />
        <Link href="/" className={styles.link}>
          Go to Magic Link Login
        </Link>
      </main>
    </div>
  );
}
