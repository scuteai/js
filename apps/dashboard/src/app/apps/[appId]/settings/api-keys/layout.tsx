import { type Metadata } from "next";
import { revalidatePath } from "next/cache";
import GuardLayout from "@/app/guard-layout";
import { createApiKey } from "@/api";
import type { AppApiKey, UniqueIdentifier } from "@/types";

import { CreateApiKeyModal } from "@/components/api-keys/CreateApiKeyModal";
import { PATHS } from "@/app/routes";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "API Keys",
  };
}

export default async function ApplicationSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { appId: UniqueIdentifier };
}) {
  const createApiKeyAction = async (nickname: AppApiKey["nickname"]) => {
    "use server";

    const data = await createApiKey(params.appId, nickname);

    if (data?.api_key) {
      revalidatePath(
        PATHS.APP_API_KEY_SETTINGS.replace("[appId]", params.appId as string)
      );
    }

    return data?.api_key ?? null;
  };

  return (
    <GuardLayout
      params={params}
      titleBarContent={<CreateApiKeyModal createApiKey={createApiKeyAction} />}
      pageTitle="API Keys"
    >
      {children}
    </GuardLayout>
  );
}
