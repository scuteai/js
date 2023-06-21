import { ReactElement, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@scute/auth-react";

const Protected = ({ children }: { children: ReactElement }) => {
  const router = useRouter();
  const { session } = useAuth();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.push("/");
    }
  }, [session.status, router]);

  if (session.status !== "authenticated") {
    return null;
  }

  return children as ReactElement;
};

export default Protected;
