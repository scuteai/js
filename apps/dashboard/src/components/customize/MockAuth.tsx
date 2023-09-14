"use client";

import { useState } from "react";
import { Auth, type AuthProps } from "@scute/ui-react";
import {
  createPatchedScuteClient,
  type PatchedScuteClientParams,
} from "./createPatchedScuteClient";

type MockAuthProps = Omit<AuthProps, "scuteClient"> & PatchedScuteClientParams;

export const MockAuth = (props: MockAuthProps) => {
  const { logo, allowed_identifiers, required_identifiers, ...authProps } =
    props;

  const [scuteClient] = useState(() =>
    createPatchedScuteClient({
      logo,
      allowed_identifiers,
      required_identifiers,
    })
  );

  return (
    <>
      <fieldset style={{
        border: 0
      }} disabled>
        <Auth {...authProps} scuteClient={scuteClient} />
      </fieldset>
    </>
  );
};
