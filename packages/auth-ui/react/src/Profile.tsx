import { useEffect, useState } from "react";
import {
  type ScuteClient,
  type ScuteUserData,
  type Session,
  sessionLoadingState,
  ScuteUserSession,
} from "@scute/core";
import type { Theme } from "@scute/ui-shared";
import { Badge, Button, ElementCard, Flex, Text, Heading, Label } from "./components";
import { createTheme } from "./stitches.config";
import { useTheme } from "./ThemeContext";
import { AppLogo } from "./components/AppLogo";
import { SessionIcon } from "./assets/sessionIcons";

export type ProfileProps = {
  scuteClient: ScuteClient;
  appearance?: {
    theme?: Theme;
  };
};

const Profile = ({ scuteClient, appearance }: ProfileProps) => {
  const [user, setUser] = useState<ScuteUserData | null>(null);
  const [session, setSession] = useState<Session>(sessionLoadingState());

  const providerTheme = useTheme();

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
      className={
        appearance?.theme || providerTheme
          ? createTheme((appearance?.theme || providerTheme) as any)
          : ""
      }
    >
      <h1>My Profile</h1>
      <ElementCard css={{ p: "$3" }}>
        <Flex css={{ fd: "column" }}>
          <Flex css={{jc:'space-between', ai:'center'}}>
            <Flex css={{fd:'column', pt:'$2', mb:'$6'}}>
              <Text css={{fontSize:'24px'}}>Umit Kitapcigil</Text>
              <Text css={{mt:'$2'}}>{user?.email}</Text>
            </Flex>
            <Flex css={{gap:'$2'}}>
              <Button variant="alt">Edit profile</Button>
              <Button onClick={() => scuteClient.signOut()}>Logout</Button>
            </Flex>
          </Flex>
          <Flex css={{fd:'column', gap:'$3', borderTop:'1px solid rgba(0,0,0,0.1)', borderBottom:'1px solid rgba(0,0,0,0.1)', width:'100%', py:'$3'}}>
            <Flex css={{gap:'$7'}}>
              <Text css={{fontSize:'$1',opacity:.5}}>Custom key</Text>
              <Text css={{fontSize:'$1'}}>Meta value</Text>
            </Flex>
            <Flex css={{gap:'$7'}}>
              <Text css={{fontSize:'$1',opacity:.5}}>Custom key</Text>
              <Text css={{fontSize:'$1'}}>Meta value</Text>
            </Flex>
            
          </Flex>
        </Flex>
        <Flex css={{ fd: "column", gap: "$1", mt: "$3" }}>
          <h3>Sessions</h3>
          {user?.sessions ? (
            <Flex css={{ fd: "column", gap: "$2" }}>
              {user.sessions.map((session) => (
                <SessionCard session={session} key={session.id} />
              ))}
            </Flex>
          ) : (
            <Flex> no sessions</Flex>
          )}
        </Flex>
      </ElementCard>
      
    </div>
  );
};

export default Profile;

const SessionCard = ({ session }: { session: ScuteUserSession }) => {
  return (
    <ElementCard css={{ p: "$3" }} key={session.id}>
      <Flex css={{ jc: "space-between" }}>
        <Flex css={{ gap: "$2", ai:'center'}}>
          <AppLogo url={session.app_logo} alt={session.app_name} size={1} />
          <Flex css={{ fd: "column" }}>
            <Text>{session.nickname}</Text>
          </Flex>
        </Flex>
        <Flex css={{ai:'center', gap:'$2'}}>
          <SessionIcon type={session.type} />
          <Button variant='alt'>Revoke</Button>
        </Flex>
      </Flex>
      <Flex css={{fd:'column', mt: "$4", gap: "$2", '@bp1':{ fd:'row', gap: "$6" } }}>
        <Flex css={{ fd: "column", gap: "$1" }}>
          <Text size="1" css={{opacity:0.5}}>Last used</Text>
          <Text size="2">{session.last_used_at}</Text>
        </Flex>
        <Flex css={{ fd: "column", gap: "$1" }}>
          <Text size="1" css={{opacity:0.5}}>Last ip</Text>
          <Text size="2">{session.last_used_at_ip}</Text>
        </Flex>
        <Flex css={{ fd: "column", gap: "$1" }}>
          <Text size="1" css={{opacity:0.5}}>Browser</Text>
          <Text size="2">{session.browser}</Text>
        </Flex>
        <Flex css={{ fd: "column", gap: "$1" }}>
          <Text size="1" css={{opacity:0.5}}>Platform</Text>
          <Text size="2">{session.platform}</Text>
        </Flex>
      </Flex>
    </ElementCard>
  );
};
