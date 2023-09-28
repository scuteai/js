import { ScuteUserData } from "@scute/nextjs";
import type { UniqueIdentifier } from "./general";

export type ScuteEvent = {
  id: UniqueIdentifier;
  slug: string;
  ip_address: string;
  user_agent: string;
  // controller: any;
  // params: any;
  // action: any;
  // note: any;
  app_id: UniqueIdentifier;
  created_at: string;
  user: ScuteUserData;
};


export type ListEventsParams = {
  page?: number;
  limit?: number;
};
