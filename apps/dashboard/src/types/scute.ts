import { UniqueIdentifier } from "./index";

export type ScuteUser = {
  id: UniqueIdentifier;
  email: string;
  username:string;
  last_login?:string;
  status?:string;
} & Record<string, unknown>;


export type ScuteActivity = {
  id: UniqueIdentifier;
  email: string;
  user_id:string;
  event_type:string;
  timestamp:string;
  ip_address:string;
  user_agent:string;
} & Record<string, unknown>;
