export const getCurrentPageTitle = (pathname: string | null): string => {
  if (!pathname || pathname === "/") {
    return "scute";
  } else {
    if (pathname.includes("users")) {
      return "Users";
    } else if (pathname.includes("new")) {
      return "Create new app";
    } else if (pathname.includes("activity")) {
      return "Activity";
    } else if (pathname.includes("/settings/auth")) {
      return "Auth";
    } else if (pathname.includes("/settings/metafields")) {
      return "Metafields";
    } else if (pathname.includes("/settings/customize")) {
      return "Customize";
    } else if (pathname.includes("/settings/email")) {
      return "Email";
    } else if (pathname.includes("/settings/api-keys")) {
      return "API Keys";
    } else if (pathname.includes("/settings")) {
      return "Application";
    } else {
      return "Summary";
    }
  }
};
