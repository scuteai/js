import type { UniqueIdentifier } from "./index";

export type ScuteEvent = {
  user_id: string; // TODO: Change to UniqueIdentifier
  email: string;
  event: string;
  created_at: string;
  ip_address: string;
  user_agent: string;
} & Record<string, unknown>;
