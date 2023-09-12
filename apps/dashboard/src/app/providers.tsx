"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { PATHS } from "./routes";
import { createClientComponentClient } from "@scute/nextjs";
import { AuthContextProvider, useAuth } from "@scute/react";
import { Toaster } from "sonner";
import { Theme as RadixTheme } from "@radix-ui/themes";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthProvider>
        <RadixThemeProvider>{children}</RadixThemeProvider>
      </AuthProvider>
      <ToastProvider />
    </>
  );
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [scuteClient] = useState(() =>
    createClientComponentClient({
      appId: process.env.NEXT_PUBLIC_SCUTE_APP_ID,
      baseUrl: process.env.NEXT_PUBLIC_SCUTE_BASE_URL,
    })
  );

  return (
    <AuthContextProvider scuteClient={scuteClient}>
      <ClientAuthGuard>{children}</ClientAuthGuard>
    </AuthContextProvider>
  );
}

const ClientAuthGuard = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useAuth();

  const guard = () =>
    (pathname.startsWith(PATHS.APPS) || pathname.startsWith(PATHS.PROFILE)) &&
    session.status === "unauthenticated";

  useEffect(() => {
    if (guard()) {
      router.push(PATHS.HOME);
    } else if (session.status === "authenticated" && pathname === PATHS.HOME) {
      router.push(PATHS.APPS);
    }
  }, [guard, session]);

  if (guard()) {
    return null;
  }

  return <>{children}</>;
};

function RadixThemeProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTheme accentColor="teal" grayColor="mauve" scaling="110%">
      {children}
    </RadixTheme>
  );
}

function ToastProvider() {
  return <Toaster />;
}
