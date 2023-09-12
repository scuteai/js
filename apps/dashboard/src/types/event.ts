import type { UniqueIdentifier } from "./general";

export type ScuteEvent = {
  user_id: UniqueIdentifier;
  email: string;
  event: string;
  created_at: string;
  ip_address: string;
  user_agent: string;
} & Record<string, unknown>;
