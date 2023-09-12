import { type Metadata } from "next";
import GuardLayout from "@/app/guard-layout";
import type { UniqueIdentifier } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Summary",
  };
}

export default async function AppSingleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { appId: UniqueIdentifier };
}) {
  return (
    <GuardLayout params={params} pageTitle="Summary">
      {children}
    </GuardLayout>
  );
}
