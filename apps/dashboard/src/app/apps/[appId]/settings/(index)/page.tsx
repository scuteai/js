import { revalidatePath } from "next/cache";
import { getApp, updateApp, deleteApp } from "@/api";
import { PATHS } from "@/app/routes";
import type { UniqueIdentifier } from "@/types";

import {
  AppSettings,
  type AppSettingsInputs,
} from "@/components/settings/ApplicationSettings";

export default async function ApplicationSettings({
  params,
}: {
  params: { appId: UniqueIdentifier };
}) {
  const appData = await getApp(params.appId);

  if (!appData) {
    // TODO: error handling
    throw new Error("App Not Found");
  }

  const deleteAppAction = async () => {
    "use server";
    const isSuccess = await deleteApp(appData.id);

    if (isSuccess) {
      revalidatePath(PATHS.APPS);
      revalidatePath(PATHS.APP.replace("[appId]", params.appId as string));
    }

    return isSuccess;
  };

  const updateAppAction = async (values: AppSettingsInputs) => {
    "use server";
    const updatedAppData = await updateApp(params.appId, values);

    if (updatedAppData) {
      revalidatePath(
        PATHS.APP_SETTINGS.replace("[appId]", params.appId as string)
      );
    }

    return updatedAppData?.app ?? null;
  };

  return (
    <AppSettings
      appData={appData}
      updateApp={updateAppAction}
      deleteApp={deleteAppAction}
    />
  );
}
