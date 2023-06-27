import { useEffect, useState } from "react";
import { type ScuteClient, type Session } from "@scute/react";
import { Badge, Button, ElementCard, Flex } from "./components";
import type { Theme } from "@scute/ui-shared";
import { createTheme } from "./stitches.config";

export type ProfileProps = {
  scuteClient: ScuteClient;
  appearance?: {
    theme?: Theme;
  };
};

const Profile = ({ scuteClient, appearance }: ProfileProps) => {
  const [session, setSession] = useState<Session>();
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>();

  useEffect(() => {
    scuteClient.getSession().then(({ data: session }) => {
      setSession(session);
    });
    scuteClient.profile().then(({ data: userProfile }) => {
      setUserProfile(userProfile);
      setIsLoading(false);
    });
  }, [scuteClient]);

  if (session?.status !== "authenticated") return null;

  const user = session.user!;
  const signOut = () => scuteClient.signOut();

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
            {user.email}
            <div>
              <Button variant="alt">Edit</Button>
            </div>
          </Flex>
        </Flex>

        {isLoading ? (
          <span>Loading...</span>
        ) : (
          <Flex css={{ fd: "column", gap: "$1", mt: "$3" }}>
            {userProfile &&
            userProfile.sessions &&
            userProfile.sessions.length > 0 ? (
              <Flex css={{ fd: "column", gap: "$1" }}>
                {userProfile.sessions.map((session: any, index: any) => (
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
      <Button onClick={() => signOut()}>Logout</Button>
    </div>
  );
};

export default Profile;
