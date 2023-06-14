import React, { useContext, useEffect, useState } from "react";
import { ScuteAuthContext } from "./ScuteAuthContext";
import { Button, Badge, Flex, ElementCard } from "@scute/auth-ui-react";

export const ProfileElement = (props: any) => {
  //@ts-ignore
  const { authState, signOut, getProfile } = useContext(ScuteAuthContext);
  const { appId, user } = authState; // TODO: Throw error if no App Id
  //@ts-ignore
  const [loaded, setLoaded] = useState(false);

  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    if (user && authState.access) {
      setLoaded(true);
      if (userProfile === null) {
        loadUserProfile();
      }
    }
  }, [authState]);

  // TODO : Refactor && move to authprovider
  const loadUserProfile = async () => {
    let a = await getProfile();
    setUserProfile(a);
  };

  const UserInfoRow = () => {
    return (
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
    );
  };

  const UserSessionsRow = () => {
    return (
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
    );
  };

  const UserProfile = () => {
    if (loaded) {
      return (
        <ElementCard css={{ p: "$3" }}>
          <UserInfoRow />
          <UserSessionsRow />
        </ElementCard>
      );
    } else {
      return <></>;
    }
  };

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto" }}>
      <h1>My Profile</h1>
      <UserProfile />
      <Button onClick={() => signOut()}>Logout</Button>

      {/* {JSON.stringify(userProfile.sessions[0])} */}
    </div>
  );
};
