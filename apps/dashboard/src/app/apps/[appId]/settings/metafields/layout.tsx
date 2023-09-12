import { type Metadata } from "next";
import GuardLayout from "@/app/guard-layout";
import type { UniqueIdentifier } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Metafields",
  };
}

export default async function MetafieldsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { appId: UniqueIdentifier };
}) {
  return (
    <GuardLayout params={params} pageTitle="Metafields">
      {children}
    </GuardLayout>
  );
}
