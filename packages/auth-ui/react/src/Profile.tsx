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
  FloatingLabelTextField,
  LargeSpinner,
  ProfileHeader,
  ProfileSubHeader,
  ProfileWrapper,
  Text,
} from "./components";
import { createTheme } from "./stitches.config";
import { useTheme } from "./ThemeContext";
import { AppLogo } from "./components/AppLogo";
import { SessionIcon } from "./assets/sessionIcons";
import { initI18n, translate as t } from "./helpers/i18n/service";

export type ProfileProps = {
  scuteClient: ScuteClient;
  language?: string;
  appearance?: {
    theme?: Theme;
  };
};

const Profile = ({ scuteClient, appearance, language }: ProfileProps) => {
  const [user, setUser] = useState<ScuteUserData | null>(null);
  const [session, setSession] = useState<Session>(sessionLoadingState());
  const [appData, setAppData] = useState<ScuteAppData | null>(null);
  const [isAnyDeviceRegistered, setIsAnyDeviceRegistered] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    initI18n(language);
  }, [language]);

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
    return <>{t("general.loginRequired")}</>;
  }

  const visibleUserMetadataSchema = appData.user_meta_data_schema.filter(
    (metafield) => metafield.visible_profile
  );

  return (
    <ProfileWrapper
      className={
        appearance?.theme || providerTheme
          ? createTheme((appearance?.theme || providerTheme) as any)
          : ""
      }
    >
      <ProfileHeader>{t("profile.myProfile")}</ProfileHeader>
      <ElementCard css={{ p: "$3" }}>
        <Flex css={{ fd: "column" }}>
          <Flex
            css={{
              jc: "space-between",
              ai: "center",
              "@container queryContainer (max-width: 520px)": {
                fd: "column",
                ai: "unset",
              },
            }}
          >
            <Flex
              css={{
                fd: "column",
                pt: "$2",
                mb: "$6",
                "@container queryContainer (max-width: 520px)": {
                  mb: "$3",
                },
              }}
            >
              <Text css={{ fontSize: "24px" }}>
                {user.meta && user.meta.first_name
                  ? `${user.meta.first_name} ${user.meta.last_name ?? ""}`
                  : user.email?.split("@")?.[0] ?? ""}
              </Text>

              <Text css={{ mt: "$2" }}>{user.email}</Text>
            </Flex>
            <Flex
              css={{
                gap: "$2",
                "@container queryContainer (max-width: 600px)": {
                  mb: "$3",
                },
              }}
            >
              {isEditMode ? (
                <Button
                  variant="alt"
                  onClick={async () => {
                    const formData = new FormData(formRef.current!);
                    setIsEditMode(false);

                    await scuteClient.updateUserMeta({
                      ...user.meta,
                      ...(Object.fromEntries(formData) as any),
                    });
                    await scuteClient.refetchSession();
                  }}
                >
                  {t("general.save")}
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
                  {!isEditMode ? t("general.editProfile") : t("general.cancel")}
                </Button>
              ) : null}
              <Button css={{ ml: "$1" }} onClick={() => scuteClient.signOut()}>
                {t("general.logout")}
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
                      <Flex
                        key={id}
                        css={{
                          gap: "$7",
                          width: "100%",
                          display: "block",
                          mb: "$2",
                        }}
                      >
                        {(!isEditMode ||
                          (isEditMode && field_type === "boolean")) && (
                          <Text css={{ fontSize: "$1", opacity: 0.5 }}>
                            {name}
                          </Text>
                        )}
                        {isEditMode ? (
                          field_type === "boolean" ? (
                            <input type="checkbox" />
                          ) : (
                            <FloatingLabelTextField
                              domId={`metafform-${name}`}
                              label={name}
                              fieldType={field_type}
                            />
                            // <TextField
                            //   defaultValue={userValue as string | undefined}
                            //   name={field_name}
                            // />
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
            <ProfileSubHeader>{t("profile.sessions")}</ProfileSubHeader>

            {!isAnyDeviceRegistered ? (
              <Button
                variant="alt"
                onClick={async () => {
                  const { error } = await scuteClient.addDevice();
                  if (error) {
                    window.alert(t("profile.errorTryAgain"));
                  } else {
                    setIsAnyDeviceRegistered(true);
                    window.confirm(t("profile.success"));
                  }
                }}
              >
                {t("registerDevice.registerDevice")}
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
            <Flex>{t("profile.noSessions")}</Flex>
          )}
        </Flex>
      </ElementCard>
    </ProfileWrapper>
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
          <SessionIcon
            color="var(--scute-colors-svgIconColor)"
            type={session.type}
          />
          <Button
            variant="alt"
            onClick={async () => {
              if (window.confirm(t("profile.confirmRevoke"))) {
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
            {t("general.revoke")}
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
            {t("profile.lastUsed")}
          </Text>
          <Text size="2">{session.last_used_at}</Text>
        </Flex>
        <Flex css={{ fd: "column", gap: "$1" }}>
          <Text size="1" css={{ opacity: 0.5 }}>
            {t("profile.lastIP")}
          </Text>
          <Text size="2">{session.last_used_at_ip}</Text>
        </Flex>
        <Flex css={{ fd: "column", gap: "$1" }}>
          <Text size="1" css={{ opacity: 0.5 }}>
            {t("profile.browser")}
          </Text>
          <Text size="2">{session.browser}</Text>
        </Flex>
        <Flex css={{ fd: "column", gap: "$1" }}>
          <Text size="1" css={{ opacity: 0.5 }}>
            {t("profile.platform")}
          </Text>
          <Text size="2">{session.platform}</Text>
        </Flex>
      </Flex>
    </ElementCard>
  );
};
