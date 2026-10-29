import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "./providers";
import { getSignedInUser } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scute MFA and RBAC example",
  description: "Sign-in, two-step verification and a protected page with Scute in Next.js",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read on the server, so the header is right on the first paint.
  const user = await getSignedInUser();

  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="header">
            <Link href="/" className="brand">
              Acme
            </Link>
            <nav>
              {user ? (
                <>
                  <Link href="/account">Account</Link>
                  <Link href="/projects">Projects</Link>
                  <span className="muted">{user.email}</span>
                  <SignOutButton />
                </>
              ) : (
                <>
                  <Link href="/sign-in">Sign in</Link>
                  <Link href="/sign-in/custom">Custom second step</Link>
                </>
              )}
            </nav>
          </header>
          <main className="main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
