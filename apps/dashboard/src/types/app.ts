import type { UniqueIdentifier } from "./general";

export type ScuteApp = {
  id: UniqueIdentifier;
  name: string;
  origin: string;
  callback_url: string;
  created_at: string;
  logo: string;
  slug: string;
};
