import type { ScuteClient, ScuteIdentifier } from "@scute/core";
import type { Views } from "@scute/ui-shared";

export interface CommonViewProps {
  scuteClient: ScuteClient;
  identifier: ScuteIdentifier;
  setAuthView: (view: Views) => void;
  setIsFatalError?: React.Dispatch<React.SetStateAction<boolean>>;
}
