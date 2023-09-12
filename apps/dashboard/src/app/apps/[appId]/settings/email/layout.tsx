import { type Metadata } from "next";
import GuardLayout from "@/app/guard-layout";
import type { UniqueIdentifier } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Email",
  };
}

export default async function EmailSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { appId: UniqueIdentifier };
}) {
  return (
    <GuardLayout params={params} pageTitle="Email">
      {children}
    </GuardLayout>
  );
}
