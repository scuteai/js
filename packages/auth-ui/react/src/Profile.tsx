import { useEffect, useState } from "react";
import {
  type ScuteClient,
  type ScuteUserData,
  type Session,
  sessionLoadingState,
} from "@scute/core";
import type { Theme } from "@scute/ui-shared";
import { Badge, Button, ElementCard, Flex } from "./components";
import { createTheme } from "./stitches.config";

export type ProfileProps = {
  scuteClient: ScuteClient;
  appearance?: {
    theme?: Theme;
  };
};

const Profile = ({ scuteClient, appearance }: ProfileProps) => {
  const [user, setUser] = useState<ScuteUserData | null>(null);
  const [session, setSession] = useState<Session>(sessionLoadingState());

  useEffect(() => {
    return scuteClient.onAuthStateChange((_event, session, user) => {
      setSession(session);
      setUser(user);
    });
  }, []);

  if (session.status === "loading") {
    return <>Loading...</>;
  } else if (session.status === "unauthenticated") {
    // TODO
    return <>Login Required.</>;
  }

  return (
    <div
      style={{ maxWidth: "640px", margin: "0 auto" }}
      className={appearance?.theme ? createTheme(appearance.theme) : ""}
    >
      <h1>My Profile</h1>
      <ElementCard css={{ p: "$3" }}>
        <Flex css={{ fd: "column" }}>
          <h3>Login info</h3>
          <Flex css={{ jc: "space-between" }}>
            <div>Email</div>
            {user?.email}
            <div>
              <Button variant="alt">Edit</Button>
            </div>
          </Flex>
        </Flex>
        <Flex css={{ fd: "column", gap: "$1", mt: "$3" }}>
          {user?.sessions ? (
            <Flex css={{ fd: "column", gap: "$1" }}>
              {user.sessions.map((session) => (
                <ElementCard css={{ p: "$2" }} key={session.id}>
                  <Flex css={{ jc: "space-between", ai: "center", pb: "$1" }}>
                    <Flex>
                      {session.user_agent_shortname} &middot; {session.platform}
                    </Flex>
                    <Badge
                      css={{
                        bc: "$contrast2",
                        fontSize: "9px",
                        p: "$1",
                        height: "auto",
                      }}
                    >
                      {session.display_name}
                    </Badge>
                  </Flex>

                  <Flex css={{ fontSize: "12px" }}>{session.created_at}</Flex>
                </ElementCard>
              ))}
            </Flex>
          ) : (
            <Flex> no sessions</Flex>
          )}
        </Flex>
      </ElementCard>
      <Button onClick={() => scuteClient.signOut()}>Logout</Button>
    </div>
  );
};

export default Profile;
