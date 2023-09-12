import { PATHS } from "@/app/routes";
import type { UniqueIdentifier } from "@/types";
import {
  BookmarkIcon,
  CrumpledPaperIcon,
  EnvelopeOpenIcon,
  LightningBoltIcon,
  LockClosedIcon,
  MixIcon,
  PaddingIcon,
  PersonIcon,
  TableIcon,
} from "@radix-ui/react-icons";

export const navItems = [
  {
    title: "Summary",
    icon: <CrumpledPaperIcon />,
    pathname: (appId: UniqueIdentifier) =>
      PATHS.APP.replace("[appId]", appId as string),
  },
  {
    title: "Users",
    icon: <PersonIcon />,
    pathname: (appId: UniqueIdentifier) =>
      PATHS.APP_USERS.replace("[appId]", appId as string),
  },
  {
    title: "Activity",
    icon: <LightningBoltIcon />,
    pathname: (appId: UniqueIdentifier) =>
      PATHS.APP_ACTIVITY.replace("[appId]", appId as string),
  },
];

export const settingsNavItems = [
  {
    title: "Application",
    icon: <BookmarkIcon />,
    pathname: (appId: UniqueIdentifier) =>
      PATHS.APP_SETTINGS.replace("[appId]", appId as string),
  },
  {
    title: "Auth",
    icon: <LockClosedIcon />,
    pathname: (appId: UniqueIdentifier) =>
      PATHS.APP_AUTH_SETTINGS.replace("[appId]", appId as string),
  },
  {
    title: "Metafields",
    icon: <TableIcon />,
    pathname: (appId: UniqueIdentifier) =>
      PATHS.APP_METAFIELD_SETTINGS.replace("[appId]", appId as string),
  },
  {
    title: "Customize",
    icon: <PaddingIcon />,
    pathname: (appId: UniqueIdentifier) =>
      PATHS.APP_CUSTOMIZE_SETTINGS.replace("[appId]", appId as string),
  },
  {
    title: "Email",
    icon: <EnvelopeOpenIcon />,
    pathname: (appId: UniqueIdentifier) =>
      PATHS.APP_EMAIL_SETTINGS.replace("[appId]", appId as string),
  },
  {
    title: "API Keys",
    icon: <MixIcon />,
    pathname: (appId: UniqueIdentifier) =>
      PATHS.APP_API_KEY_SETTINGS.replace("[appId]", appId as string),
  },
];
