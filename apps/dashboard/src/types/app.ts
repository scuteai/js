import type { UniqueIdentifier } from "./index";

export type ScuteApp = {
  id: UniqueIdentifier;
  name: string;
  slug: string;
  origin: string;
} & Record<string, unknown>;
