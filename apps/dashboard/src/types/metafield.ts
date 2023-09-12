import type { UniqueIdentifier } from "./general";

export type Metafield = {
  id: UniqueIdentifier;
  name: string;
  type: string;
  field_name: string;
  visible_profile: boolean;
  visible_registration: boolean;
};
