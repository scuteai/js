export const basePath = null;

export const ROUTES = [
  {
    key: "HOME",
    pathname: "/",
  },
  {
    key: "PROFILE",
    pathname: "/profile",
  },
  {
    key: "APPS",
    pathname: "/apps",
  },
  {
    key: "NEW_APP",
    pathname: "/apps/new",
  },
  {
    key: "APP",
    pathname: "/apps/[appId]",
  },
  {
    key: "APP_ACTIVITY",
    pathname: "/apps/[appId]/activity",
  },
  {
    key: "APP_USERS",
    pathname: "/apps/[appId]/users",
  },
  {
    key: "APP_USER",
    pathname: "/apps/[appId]/users/[userId]",
  },
  {
    key: "APP_SETTINGS",
    pathname: "/apps/[appId]/settings",
  },
  {
    key: "APP_AUTH_SETTINGS",
    pathname: "/apps/[appId]/settings/auth",
  },
  {
    key: "APP_METAFIELD_SETTINGS",
    pathname: "/apps/[appId]/settings/metafields",
  },
  {
    key: "APP_CUSTOMIZE_SETTINGS",
    pathname: "/apps/[appId]/settings/customize",
  },
  {
    key: "APP_EMAIL_SETTINGS",
    pathname: "/apps/[appId]/settings/email",
  },
  {
    key: "APP_API_KEY_SETTINGS",
    pathname: "/apps/[appId]/settings/api-keys",
  },
] as const satisfies readonly {
  key: string;
  pathname: string;
  meta?: {
    isExternal?: boolean;
  };
}[];

type Routes = (typeof ROUTES)[number];
type RouteKey = Routes["key"];

export const PATHS = (<T extends RouteKey>() =>
  ROUTES.reduce(
    (obj, { key, pathname }) => {
      (obj as any)[key] = basePath ? pathname.replace(basePath, "") : pathname;

      return obj;
    },
    {} as {
      [K in T]: Extract<Routes, { key: K }>["pathname"];
    }
  ))();