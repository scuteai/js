import React from "react";
import { ScuteAuthContext } from "./ScuteAuthContext";

interface ProtectedProps {
  children: JSX.Element;
  loginPath: string;
}

const Protected: React.FunctionComponent<ProtectedProps> = ({
  children,
  loginPath,
}) => {
  const context = React.useContext(ScuteAuthContext);
  console.log("protected: ", context);
  if (context === null) {
    throw new Error(
      "Scute Auth Provider is missing. " +
        "Please add the ScuteAuthProvider before Router"
    );
  }
  return children;
};

export default Protected;
