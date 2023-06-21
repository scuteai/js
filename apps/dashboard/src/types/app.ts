import type { UniqueIdentifier } from "./index";

export type ScuteApp = {
  id: UniqueIdentifier;
  name: string;
  slug: string;
  url: string;
} & Record<string, unknown>;
