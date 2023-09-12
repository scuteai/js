import { type Metadata } from "next";
import GuardLayout from "@/app/guard-layout";
import type { UniqueIdentifier } from "@/types";
import { UsersTitleBarContent } from "@/components/users/UsersTitleBarContent";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Users",
  };
}

export default async function UsersLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { appId: UniqueIdentifier };
}) {
  return (
    <GuardLayout
      params={params}
      titleBarContent={<UsersTitleBarContent />}
      pageTitle="Users"
    >
      {children}
    </GuardLayout>
  );
}
