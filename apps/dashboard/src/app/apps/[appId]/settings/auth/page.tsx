import { revalidatePath } from "next/cache";
import { getApp, updateApp } from "@/api";
import type { UniqueIdentifier } from "@/types";
import { PATHS } from "@/app/routes";
import {
  AuthSettings,
  type AuthSettingsInputs,
} from "@/components/settings/AuthSettings";

export default async function AuthenticationSettings({
  params,
}: {
  params: { appId: UniqueIdentifier };
}) {
  const appData = await getApp(params.appId);

  if (!appData) {
    // TODO: error handling
    throw new Error("App Not Found");
  }

  const updateAppAction = async (values: AuthSettingsInputs) => {
    "use server";
    const updatedAppData = await updateApp(params.appId, { auth: values });

    if (updatedAppData) {
      revalidatePath(
        PATHS.APP_AUTH_SETTINGS.replace("[appId]", params.appId as string)
      );
    }

    return updatedAppData?.app ?? null;
  };

  return <AuthSettings appData={appData} updateApp={updateAppAction} />;
}
