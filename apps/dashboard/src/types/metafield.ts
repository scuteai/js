import type { UniqueIdentifier } from "./index";

export type Metafield = {
  id?: UniqueIdentifier;
  name:string;
  type:string;
  field_name:string;
  visible_profile:boolean;
  visible_registration:boolean;
} 
