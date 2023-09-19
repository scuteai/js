import { useEffect, useRef, useState } from "react";
import {
  type ScuteClient,
  type ScuteUserData,
  type Session,
  type ScuteUserSession,
  sessionLoadingState,
  ScuteAppData,
} from "@scute/core";
import type { Theme } from "@scute/ui-shared";
import {
  Button,
  ElementCard,
  Flex,
  LargeSpinner,
  Text,
  TextField,
} from "./components";
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
  const [appData, setAppData] = useState<ScuteAppData | null>(null);
  const [isAnyDeviceRegistered, setIsAnyDeviceRegistered] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    (async () => {
      const { data: appData } = await scuteClient.getAppData(true);
      setAppData(appData);
    })();

    (async () => {
      try {
        const isAnyDeviceRegistered = await scuteClient.isAnyDeviceRegistered();
        setIsAnyDeviceRegistered(isAnyDeviceRegistered);
      } catch {
        // login required
        // ignore
      }
    })();

    return scuteClient.onAuthStateChange((_event, session, user) => {
      setSession(session);
      setUser(user);
    });
  }, []);

  const providerTheme = useTheme();

  const [isEditMode, _setIsEditMode] = useState(false);
  const setIsEditMode: typeof _setIsEditMode = (...params) => {
    if (appData!.profile_management !== false) {
      _setIsEditMode(...params);
    }
  };

  const formRef = useRef<HTMLFormElement>(null);

  if (session.status === "loading" || !appData) {
    return (
      <Flex
        justify="center"
        align="center"
        css={{
          height: "75vh",
        }}
      >
        <LargeSpinner />
      </Flex>
    );
  } else if (session.status === "unauthenticated" || !user) {
    return <>Login Required.</>;
  }

  const visibleUserMetadataSchema = appData.user_meta_data_schema.filter(
    (metafield) => metafield.visible_profile
  );

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
          <Flex css={{ jc: "space-between", ai: "center" }}>
            <Flex css={{ fd: "column", pt: "$2", mb: "$6" }}>
              <Text css={{ fontSize: "24px" }}>
                {user.meta && user.meta.first_name
                  ? `${user.meta.first_name} ${user.meta.last_name ?? ""}`
                  : user.email?.split("@")?.[0] ?? ""}
              </Text>

              <Text css={{ mt: "$2" }}>{user.email}</Text>
            </Flex>
            <Flex css={{ gap: "$2" }}>
              {isEditMode ? (
                <Button
                  variant="alt"
                  onClick={async () => {
                    const formData = new FormData(formRef.current!);
                    setIsEditMode(false);

                    await scuteClient.updateUserMeta({
                      ...user.meta,
                      ...Object.fromEntries(formData),
                    });
                    await scuteClient.refetchSession();
                  }}
                >
                  Save
                </Button>
              ) : null}
              {appData.profile_management !== false &&
              visibleUserMetadataSchema.length > 0 ? (
                <Button
                  variant="alt"
                  onClick={() => {
                    setIsEditMode(!isEditMode);
                  }}
                >
                  {!isEditMode ? "Edit profile" : "Cancel"}
                </Button>
              ) : null}
              <Button css={{ ml: "$1" }} onClick={() => scuteClient.signOut()}>
                Logout
              </Button>
            </Flex>
          </Flex>
          {visibleUserMetadataSchema.length > 0 ? (
            <form ref={formRef}>
              <Flex
                css={{
                  fd: "column",
                  gap: "$3",
                  borderTop: "1px solid rgba(0,0,0,0.1)",
                  borderBottom: "1px solid rgba(0,0,0,0.1)",
                  width: "100%",
                  py: "$3",
                }}
              >
                {visibleUserMetadataSchema.map(
                  ({ id, name, field_name, field_type }) => {
                    const userValue = user.meta?.[field_name];

                    return (
                      <Flex key={id} css={{ gap: "$7" }}>
                        <Text css={{ fontSize: "$1", opacity: 0.5 }}>
                          {name}
                        </Text>
                        {isEditMode ? (
                          field_type === "boolean" ? (
                            <input type="checkbox" />
                          ) : (
                            <TextField
                              defaultValue={userValue as string | undefined}
                              name={field_name}
                            />
                          )
                        ) : field_type === "boolean" ? (
                          <input
                            type="checkbox"
                            readOnly
                            checked={userValue === true}
                          />
                        ) : (
                          <Text css={{ fontSize: "$1" }}>{userValue}</Text>
                        )}
                      </Flex>
                    );
                  }
                )}
              </Flex>
            </form>
          ) : null}
        </Flex>
        <Flex css={{ fd: "column", gap: "$1", mt: "$3" }}>
          <Flex css={{ jc: "space-between", ai: "center" }}>
            <h3>Sessions</h3>

            {!isAnyDeviceRegistered ? (
              <Button
                variant="alt"
                onClick={async () => {
                  const { error } = await scuteClient.addDevice();
                  if (error) {
                    window.alert("An error has occurred. You can try again.");
                  } else {
                    setIsAnyDeviceRegistered(true);
                    window.confirm("Success!");
                  }
                }}
              >
                Register Device
              </Button>
            ) : null}
          </Flex>
          {user.sessions ? (
            <Flex css={{ fd: "column", gap: "$2" }}>
              {user.sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  scuteClient={scuteClient}
                  appData={appData}
                  session={session}
                />
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

const SessionCard = ({
  scuteClient,
  appData,
  session,
}: {
  scuteClient: ScuteClient;
  appData: ScuteAppData;
  session: ScuteUserSession;
}) => {
  return (
    <ElementCard css={{ p: "$3" }} key={session.id}>
      <Flex css={{ jc: "space-between" }}>
        <Flex css={{ gap: "$2", ai: "center" }}>
          <AppLogo url={appData.logo} alt={appData.name} size={1} />
          <Flex css={{ fd: "column" }}>
            <Text>{session.nickname}</Text>
          </Flex>
        </Flex>
        <Flex css={{ ai: "center", gap: "$2" }}>
          <SessionIcon type={session.type} />
          <Button
            variant="alt"
            onClick={async () => {
              if (
                window.confirm("Do you really want to revoke this session ?")
              ) {
                await scuteClient.revokeSession(
                  session.id,
                  session.credential_id
                );
                setTimeout(async () => {
                  await scuteClient.refetchSession();
                }, 100);
              }
            }}
          >
            Revoke
          </Button>
        </Flex>
      </Flex>
      <Flex
        css={{
          fd: "column",
          mt: "$4",
          gap: "$2",
          "@bp1": { fd: "row", gap: "$6" },
        }}
      >
        <Flex css={{ fd: "column", gap: "$1" }}>
          <Text size="1" css={{ opacity: 0.5 }}>
            Last used
          </Text>
          <Text size="2">{session.last_used_at}</Text>
        </Flex>
        <Flex css={{ fd: "column", gap: "$1" }}>
          <Text size="1" css={{ opacity: 0.5 }}>
            Last ip
          </Text>
          <Text size="2">{session.last_used_at_ip}</Text>
        </Flex>
        <Flex css={{ fd: "column", gap: "$1" }}>
          <Text size="1" css={{ opacity: 0.5 }}>
            Browser
          </Text>
          <Text size="2">{session.browser}</Text>
        </Flex>
        <Flex css={{ fd: "column", gap: "$1" }}>
          <Text size="1" css={{ opacity: 0.5 }}>
            Platform
          </Text>
          <Text size="2">{session.platform}</Text>
        </Flex>
      </Flex>
    </ElementCard>
  );
};
