import type { ScuteClient } from "@scute/auth-react";
import type { Views } from "@scute/auth-ui-shared";

export interface CommonViewProps {
  scuteClient: ScuteClient;
  email: string;
  setAuthView: (view: Views) => void;
}
