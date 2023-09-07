import type { UniqueIdentifier } from "./index";

export type ScuteUser = {
  id: string; // TODO: Change to UniqueIdentifier
  fullName: string;
  email: string;
  status: string;
  lastLogin: string;
  signupDate: string;
} & Record<string, unknown>;
