import * as React from "react";
import { ScuteAuthContext } from "./ScuteAuthContext";
import { LoginElement } from "./LoginElement";

interface ProtectedProps {
  children: JSX.Element;
  loginPath: string;
}

const NextJsLoginElement: React.FunctionComponent<ProtectedProps> = ({
  children,
  loginPath,
}) => {
  const context = React.useContext(ScuteAuthContext);
  console.log("protected: ", context);
  if (context === null) {
    throw new Error(
      "Auth Provider is missing. " + "Please add the AuthProvider before Router"
    );
  }

  return <LoginElement />;
};

export default NextJsLoginElement;
