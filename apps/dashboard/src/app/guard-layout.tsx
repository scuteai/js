import "server-only";

import { redirect } from "next/navigation";
import { type ReactElement } from "react";
import { getCurrentUser, getApp } from "@/api";
import { PATHS } from "./routes";
import type { UniqueIdentifier } from "@/types";
import {
  BaseLayout,
  type BaseLayoutProps,
} from "@/components/shared/BaseLayout";

export default async function GuardLayout({
  params,
  children,
  ...restLayoutProps
}: {
  params?: { appId?: UniqueIdentifier };
  children: React.ReactNode;
  //@ts-ignore
} & Omit<BaseLayoutProps, "currentUser" | "appData">): ReactElement {
  const user = await getCurrentUser();

  if (!user) {
    redirect(PATHS.HOME);
  }

  const appData = params?.appId ? await getApp(params.appId) : undefined;

  return (
    <BaseLayout currentUser={user} appData={appData} {...restLayoutProps}>
      {children}
    </BaseLayout>
  );
}
