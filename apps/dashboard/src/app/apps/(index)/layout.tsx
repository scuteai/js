import Link from "next/link";
import { type Metadata } from "next";
import { PATHS } from "@/app/routes";
import GuardLayout from "../../guard-layout";
import { Button } from "@radix-ui/themes";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Apps",
  };
}

export default async function AppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GuardLayout
      pageTitle="Apps"
      titleBarContent={
        <Link href={PATHS.NEW_APP}>
          <Button>Create new app</Button>
        </Link>
      }
    >
      {children}
    </GuardLayout>
  );
}
