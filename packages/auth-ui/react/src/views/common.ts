import type { ScuteClient } from "@scute/react";
import type { Views } from "@scute/ui-shared";

export interface CommonViewProps {
  scuteClient: ScuteClient;
  email: string;
  setAuthView: (view: Views) => void;
  error?: string | null;
}
