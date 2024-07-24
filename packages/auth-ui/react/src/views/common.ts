import type { ScuteClient, ScuteIdentifier } from "@scute/core";
import type { Views } from "@scute/ui-shared";
import { IslandProps } from "../components/Island";

export interface CommonViewProps {
  scuteClient: ScuteClient;
  identifier: ScuteIdentifier;
  setAuthView: (view: Views) => void;
  setIsFatalError?: React.Dispatch<React.SetStateAction<boolean>>;
  setIslandProps?: (props: IslandProps) => void;
  resetIslandProps?: () => void;
}
