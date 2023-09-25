import { type Metadata } from "next";
import GuardLayout from "@/app/guard-layout";
import type { UniqueIdentifier, ScuteIdentifier } from "@/types";
import { inviteUser } from "@/api";
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
  const inviteUserAction = async (identifier: ScuteIdentifier) => {
    "use server";
    return inviteUser(params.appId, identifier);
  };

  return (
    <GuardLayout
      params={params}
      titleBarContent={<UsersTitleBarContent inviteUser={inviteUserAction} />}
      pageTitle="Users"
    >
      {children}
    </GuardLayout>
  );
}
