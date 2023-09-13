import type { UniqueIdentifier } from "./general";

export type Metafield = {
  id: UniqueIdentifier;
  name: string;
  field_type:
    | "string"
    | "boolean"
    | "integer"
    | "date"
    | "phone"
    | "email"
    | "text"
    | "url";
  field_name: string;
  visible_profile: boolean;
  visible_registration: boolean;
  required: boolean;
};
