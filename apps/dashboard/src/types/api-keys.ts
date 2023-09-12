import { UniqueIdentifier } from "./general";

export type AppApiKey = {
  id: UniqueIdentifier;
  nickname: string;
  bearer_id: UniqueIdentifier;
  token_digest?: string;
  created_at: string;
};
