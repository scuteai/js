import { useEffect, useState } from "react";
import type { ScuteClient } from "@scute/core";
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
  const [isDevicesLoading, setIsDevicesLoading] = useState(true);
  const user = null as any;

  // TODO
  const userT: any = {};

  useEffect(() => {
    setIsDevicesLoading(false);
  }, []);

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

        {isDevicesLoading ? (
          <span>Loading...</span>
        ) : (
          <Flex css={{ fd: "column", gap: "$1", mt: "$3" }}>
            {userT && userT.sessions && userT.sessions.length > 0 ? (
              <Flex css={{ fd: "column", gap: "$1" }}>
                {userT.sessions.map((session: any, index: any) => (
                  <ElementCard css={{ p: "$2" }} key={index}>
                    <Flex css={{ jc: "space-between", ai: "center", pb: "$1" }}>
                      <Flex>
                        {session.credential.browser_name} &middot;{" "}
                        {session.credential.platform_name}
                      </Flex>
                      <Badge
                        css={{
                          bc: "$contrast2",
                          fontSize: "9px",
                          p: "$1",
                          height: "auto",
                        }}
                      >
                        {session.credential.nickname}
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
        )}
      </ElementCard>
      <Button onClick={() => scuteClient.signOut()}>Logout</Button>
    </div>
  );
};

export default Profile;
