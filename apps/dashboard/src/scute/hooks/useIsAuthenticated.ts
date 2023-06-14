import * as React from "react";
import { ScuteAuthContext } from "../ScuteAuthContext";

function useIsAuthenticated(): () => boolean {
  const context = React.useContext(ScuteAuthContext);
  if (context === null) {
    throw new Error(
      "Scute Auth Provider is missing. " +
        "Please add ScuteAuthProvider to the parent element"
    );
  }
  return () => {
    if (context.authState?.status === "authenticated") {
      return true;
    } else {
      return false;
    }
  };
}
/**
 *@exports useIsAuthenticated
 */
export default useIsAuthenticated;
