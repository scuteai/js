import React, { useState, useEffect } from "react";
import {
  type ScuteClient,
  type ScuteWebauthnOption,
  type ScuteIdentifier,
  type ScuteTokenPayload,
  type UniqueIdentifier,
  type ScuteAppData,
  AUTH_CHANGE_EVENTS,
  SCUTE_MAGIC_PARAM,
  decodeMagicLinkToken,
  SCUTE_SKIP_PARAM,
  SCUTE_OAUTH_PKCE_PARAM,
} from "@scute/core";
import { type Theme, VIEWS, type Views } from "@scute/ui-shared";

import {
  AppNamePlaceholder,
  Content,
  ElementCard,
  Flex,
  FooterCredits,
  FooterLinks,
  Header,
  LargeSpinner,
  Layout,
  LogoContainer,
  LogoPlaceholder,
} from "./components";
import {
  SignInOrUp,
  RegisterDevice,
  VerifyDevice,
  VerifyMagicLinkOtp,
  FatalErrorView,
} from "./views";
import { createTheme } from "./stitches.config";
import { useTheme } from "./ThemeContext";
import { initI18n, translate as t } from "./helpers/i18n/service";
import { AppLogo } from "./components/AppLogo";
import { LogoText } from "./components/Logo";
import { Island, type IslandProps } from "./components/Island";
import { PkceOtp } from "./views/PkceOtp";
import VerifyManualOtp from "./views/VerifyManualOtp";

export type AuthProps = {
  scuteClient: ScuteClient;
  onSignIn?: () => void;
  view?: Extract<Views, "sign-in-or-up" | "sign-in" | "sign-up">;
  webauthn?: ScuteWebauthnOption;
  language?: string;
  appearance?: {
    theme?: Theme;
  };
  policyURLs?: {
    privacyPolicy?: string;
    termsOfService?: string;
  };
  logoUrl?: string;
};

function Auth(props: AuthProps) {
  const {
    scuteClient,
    appearance: _appearance,
    view = VIEWS.SIGN_IN_OR_UP,
    webauthn = "optional",
    language,
    onSignIn,
    policyURLs,
    logoUrl,
  } = props;

  if (!policyURLs) {
    console.warn(
      "The 'policyURLs' property of the Scute Auth component is not provided."
    );
  }

  if (!policyURLs) {
    console.warn(
      "The 'logo' property of the Scute Auth component is not provided."
    );
  }

  const islandPropsInitial: IslandProps = {
    active: false,
    label: "",
    Icon: <></>,
  };

  const [identifier, setIdentifier] = useState<ScuteIdentifier>("");
  const [isFatalError, setIsFatalError] = useState(false);

  const [magicLinkId, setMagicLinkId] = useState<UniqueIdentifier>();
  const [authPayload, setAuthPayload] = useState<ScuteTokenPayload>();
  const [islandProps, setIslandProps] =
    useState<IslandProps>(islandPropsInitial);

  const resetIslandProps = () => {
    if (!islandProps.active) return;
    setIslandProps(islandPropsInitial);
  };

  const [_authView, setAuthView] = useState<Views>(() => {
    if (
      typeof window !== "undefined" &&
      typeof URLSearchParams !== "undefined" &&
      new URL(window.location.href).searchParams.has(SCUTE_OAUTH_PKCE_PARAM)
    ) {
      return VIEWS.PKCE_OAUTH;
    }

    if (
      typeof window !== "undefined" &&
      typeof URLSearchParams !== "undefined" &&
      new URL(window.location.href).searchParams.has(SCUTE_MAGIC_PARAM)
    ) {
      const magicPayload = decodeMagicLinkToken(
        new URL(window.location.href).searchParams.get(SCUTE_MAGIC_PARAM)!
      );
      if (magicPayload) {
        if (magicPayload.user_status === "pending") {
          return VIEWS.CONFIRM_INVITE;
        } else if (
          !!new URL(window.location.href).searchParams.has(SCUTE_SKIP_PARAM)
        ) {
          return VIEWS.PKCE_OAUTH;
        } else {
          return VIEWS.MAGIC_LOADING;
        }
      }
    }

    return view;
  });

  const authView = _authView === VIEWS.SIGN_IN_OR_UP ? view : _authView;

  const appearance: AuthProps["appearance"] = {
    // defaults

    // client preferences
    ..._appearance,
  };

  const [appData, _setAppData] = useState<ScuteAppData>();

  const containerProps: Omit<ContainerProps, "children"> = {
    ...props,
    appearance,
    appData,
    islandProps,
    logoUrl,
  };

  useEffect(() => {
    initI18n(language);
  }, [language]);

  useEffect(() => {
    if (isFatalError) return;
    (async () => {
      const { data, error: appDataError } = await scuteClient.getAppData(true);

      if (appDataError) {
        setIsFatalError(true);
        return;
      }

      _setAppData(data);
    })();
  }, [scuteClient, isFatalError]);

  useEffect(() => {
    const unsubscribe = scuteClient.onAuthStateChange(async (event) => {
      if (event === AUTH_CHANGE_EVENTS.SIGNED_IN) {
        onSignIn?.();
      } else if (event === AUTH_CHANGE_EVENTS.SIGNED_OUT) {
        //
      } else if (event === AUTH_CHANGE_EVENTS.MAGIC_PENDING) {
        setAuthView(VIEWS.MAGIC_PENDING);
      } else if (event === AUTH_CHANGE_EVENTS.MAGIC_NEW_DEVICE_PENDING) {
        setAuthView(VIEWS.MAGIC_NEW_DEVICE_PENDING);
      } else if (event === AUTH_CHANGE_EVENTS.OTP_PENDING) {
        setAuthView(VIEWS.OTP_PENDING);
      } else if (event === AUTH_CHANGE_EVENTS.WEBAUTHN_REGISTER_START) {
        setAuthView(VIEWS.WEBAUTHN_REGISTER);
      } else if (event === AUTH_CHANGE_EVENTS.WEBAUTHN_VERIFY_START) {
        setAuthView(VIEWS.WEBAUTHN_VERIFY);
      }
    });

    return () => unsubscribe();
  }, [scuteClient, onSignIn, view]);

  const [_isMounted, _setIsMounted] = useState(false);
  useEffect(() => {
    _setIsMounted(true);
  }, []);
  if (!_isMounted) {
    return null;
  }

  if (isFatalError) {
    return (
      <Container {...containerProps}>
        <FatalErrorView
          scuteClient={scuteClient}
          identifier={identifier}
          setAuthView={setAuthView}
          tryAgain={() => {
            setIsFatalError(false);
            setAuthView(VIEWS.SIGN_IN_OR_UP);
          }}
          resetIslandProps={resetIslandProps}
        />
      </Container>
    );
  }

  if (!appData) {
    return (
      <Container {...containerProps}>
        <LargeSpinner />
      </Container>
    );
  }

  switch (authView) {
    case VIEWS.SIGN_IN_OR_UP:
      return (
        <Container {...containerProps}>
          <SignInOrUp
            scuteClient={scuteClient}
            mode="sign_in_or_up"
            setAuthView={setAuthView}
            identifier={identifier}
            setIdentifier={setIdentifier}
            appData={appData}
            setIsFatalError={setIsFatalError}
            webauthnEnabled={webauthn !== "disabled"}
            getMagicLinkIdCallback={(id) => setMagicLinkId(id)}
            policyURLs={policyURLs}
          />
        </Container>
      );
    case VIEWS.SIGN_IN:
      return (
        <Container {...containerProps}>
          <SignInOrUp
            scuteClient={scuteClient}
            mode="sign_in"
            setAuthView={setAuthView}
            identifier={identifier}
            setIdentifier={setIdentifier}
            appData={appData}
            setIsFatalError={setIsFatalError}
            webauthnEnabled={webauthn !== "disabled"}
            getMagicLinkIdCallback={(id) => setMagicLinkId(id)}
          />
        </Container>
      );
    case VIEWS.SIGN_UP:
      return (
        <Container {...containerProps}>
          <SignInOrUp
            scuteClient={scuteClient}
            mode="sign_up"
            setAuthView={setAuthView}
            identifier={identifier}
            setIdentifier={setIdentifier}
            appData={appData}
            setIsFatalError={setIsFatalError}
            webauthnEnabled={webauthn !== "disabled"}
            getMagicLinkIdCallback={(id) => setMagicLinkId(id)}
          />
        </Container>
      );
    case VIEWS.CONFIRM_INVITE:
      return (
        <Container {...containerProps}>
          <SignInOrUp
            scuteClient={scuteClient}
            mode="confirm_invite"
            setAuthView={setAuthView}
            identifier={identifier}
            setIdentifier={setIdentifier}
            appData={appData}
            setIsFatalError={setIsFatalError}
            webauthnEnabled={webauthn !== "disabled"}
            getMagicLinkIdCallback={(id) => setMagicLinkId(id)}
            getAuthPayloadCallback={(payload) => setAuthPayload(payload)}
          />
        </Container>
      );
    case VIEWS.WEBAUTHN_REGISTER:
      return !!authPayload ? (
        <Container {...containerProps}>
          <RegisterDevice
            scuteClient={scuteClient}
            identifier={identifier}
            setAuthView={setAuthView}
            setIsFatalError={setIsFatalError}
            webauthn={webauthn}
            authPayload={authPayload}
            isWebauthnSupported={scuteClient.isWebauthnSupported()}
            setIslandProps={setIslandProps}
            resetIslandProps={resetIslandProps}
          />
        </Container>
      ) : (
        <Container {...containerProps}>
          <LargeSpinner />
        </Container>
      );
    case VIEWS.WEBAUTHN_VERIFY:
      return (
        <Container {...containerProps}>
          <VerifyDevice
            scuteClient={scuteClient}
            identifier={identifier}
            setAuthView={setAuthView}
            setIsFatalError={setIsFatalError}
            getMagicLinkIdCallback={(id) => setMagicLinkId(id)}
          />
        </Container>
      );
    case VIEWS.MAGIC_LOADING:
    case VIEWS.MAGIC_PENDING:
    case VIEWS.MAGIC_NEW_DEVICE_PENDING:
      return (
        <Container {...containerProps}>
          <VerifyMagicLinkOtp
            scuteClient={scuteClient}
            identifier={identifier}
            setAuthView={setAuthView}
            setIsFatalError={setIsFatalError}
            getAuthPayloadCallback={(payload) => {
              setAuthPayload(payload);
            }}
            magicLinkId={magicLinkId}
            isWebauthnNewDevice={authView === VIEWS.MAGIC_NEW_DEVICE_PENDING}
            setIslandProps={setIslandProps}
            resetIslandProps={resetIslandProps}
          />
        </Container>
      );
    case VIEWS.OTP_PENDING:
      return (
        <Container {...containerProps}>
          <VerifyManualOtp
            scuteClient={scuteClient}
            identifier={identifier}
            setAuthView={setAuthView}
            setIsFatalError={setIsFatalError}
            getAuthPayloadCallback={(payload) => {
              setAuthPayload(payload);
            }}
          />
        </Container>
      );
    case VIEWS.PKCE_OAUTH:
      return (
        <Container {...containerProps}>
          <PkceOtp
            scuteClient={scuteClient}
            mode="confirm_invite"
            setAuthView={setAuthView}
            identifier={identifier}
            setIdentifier={setIdentifier}
            appData={appData}
            setIsFatalError={setIsFatalError}
            webauthnEnabled={webauthn !== "disabled"}
            getMagicLinkIdCallback={(id) => setMagicLinkId(id)}
            getAuthPayloadCallback={(payload) => setAuthPayload(payload)}
          />
        </Container>
      );
    default:
      return null;
  }
}

interface ContainerProps extends AuthProps {
  appData?: ScuteAppData;
  children: React.ReactNode;
  logoUrl?: string;
  islandProps: IslandProps;
}

const Container = ({
  scuteClient,
  appData,
  appearance,
  webauthn,
  children,
  logoUrl,
  islandProps,
}: ContainerProps) => {
  const providerTheme = useTheme();

  return (
    <Layout
      className={
        appearance?.theme || providerTheme
          ? createTheme((appearance?.theme || providerTheme) as any)
          : ""
      }
    >
      <Header>
        <LogoContainer>
          {appData && logoUrl ? (
            <AppLogo url={logoUrl} alt={appData.name} size={1} />
          ) : (
            <LogoPlaceholder />
          )}
          <span style={{ color: "var(--scute-colors-surfaceText)" }}>
            {appData ? appData.name : <AppNamePlaceholder />}
          </span>
        </LogoContainer>
      </Header>
      <ElementCard>
        <Island {...islandProps} />
        <Content>{children}</Content>
      </ElementCard>
      {appData?.scute_branding !== false ? (
        <Flex css={{ pb: "$1" }}>
          <FooterCredits>
            <LogoText />
          </FooterCredits>
          <FooterLinks>
            <a href="https://scute.io/privacy" target="_blank">
              {t("signInOrUp.privacy")}
            </a>
            <a href="https://scute.io/help" target="_blank">
              {t("signInOrUp.help")}
            </a>
          </FooterLinks>
        </Flex>
      ) : null}
    </Layout>
  );
};

export default Auth;
