"use client";

import { useState } from "react";
import { Profile, type ProfileProps } from "@scute/ui-react";
import {
  createPatchedScuteClient,
  type PatchedScuteClientParams,
} from "./createPatchedScuteClient";
import { type ScuteUserSession } from "@scute/nextjs";

type MockProfileProps = Omit<ProfileProps, "scuteClient"> &
  PatchedScuteClientParams;

export const MockProfile = (props: MockProfileProps) => {
  const { logo, allowed_identifiers, required_identifiers, ...profileProps } =
    props;

  const [scuteClient] = useState(() =>
    createPatchedScuteClient({
      logo,
      allowed_identifiers,
      required_identifiers,
      user: {
        id: "abc-123",
        status: "active",
        email: "user@mail.com",
        sessions: [
          {
            id: "abc-1234",
            nickname: "Device",
            type: "webauthn",
            credential_id: "def-567",
            last_used_at: new Date().toDateString(),
            last_used_at_ip: "127.0.0.1",
            browser: "Chrome",
            platform: "macOS",
          } as ScuteUserSession,
        ],
      },
    })
  );

  return (
    <>
      <fieldset
        style={{
          border: 0,
        }}
        disabled
      >
        <Profile {...profileProps} scuteClient={scuteClient} />
      </fieldset>
    </>
  );
};
