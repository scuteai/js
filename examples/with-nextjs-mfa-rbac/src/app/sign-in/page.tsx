import { SignIn } from "./sign-in";
import { safeNext } from "@/lib/safe-next";

// The page is a server component so it can read ?next= without a Suspense
// boundary; the sign-in itself is a client component.
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <SignIn next={safeNext(next)} />;
}
