import { revalidatePath } from "next/cache";
import { createApp } from "@/api";
import { PATHS } from "@/app/routes";
import type { ScuteApp } from "@/types";

import { NewAppContainer } from "@/components/apps/NewAppContainer";

export default function NewApp() {
  const createAppAction = async (app: Partial<ScuteApp>) => {
    "use server";
    const data = await createApp(app);
    if (data) {
      revalidatePath(PATHS.APPS);
    }

    return { data };
  };

  return <NewAppContainer createApp={createAppAction} />;
}
