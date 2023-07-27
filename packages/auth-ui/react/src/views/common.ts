import type { ScuteClient, ScuteIdentifier } from "@scute/react";
import type { Views } from "@scute/ui-shared";

export interface CommonViewProps {
  scuteClient: ScuteClient;
  identifier: ScuteIdentifier;
  setAuthView: (view: Views) => void;
  error?: string | null;
}
