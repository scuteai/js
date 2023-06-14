import * as React from "react";
import { ScuteAuthContext } from "../ScuteAuthContext";

type UseSignOut = () => boolean;

export function useSignOut(): () => boolean {
  /**
   *A constant c.
   *@kind constant
   */
  const context = React.useContext(ScuteAuthContext);
  if (context === null) {
    throw new Error(
      "Auth Provider is missing. " + "Please add the AuthProvider before Router"
    );
  }

  return () => {
    try {
      if (context) {
        context.signOut();
        return true;
      } else {
        return false;
      }
    } catch (e) {
      return false;
    }
  };
}
/**
 *@exports useSignOut
 */
