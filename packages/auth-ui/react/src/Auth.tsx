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
} from "@scute/core";
import { type Theme, VIEWS, type Views } from "@scute/ui-shared";
import {
  Content,
  ElementCard,
  Flex,
  FooterCredits,
  LargeSpinner,
  Layout,
  Logo,
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

export type AuthProps = {
  scuteClient: ScuteClient;
  onSignIn?: () => void;
  view?: Extract<Views, "sign-in-or-up" | "sign-in" | "sign-up">;
  webauthn?: ScuteWebauthnOption;
  appearance?: {
    theme?: Theme;
  };
};

function Auth(props: AuthProps) {
  const {
    scuteClient,
    appearance: _appearance,
    view = VIEWS.SIGN_IN_OR_UP,
    webauthn = "optional",
    onSignIn,
  } = props;

  const [identifier, setIdentifier] = useState<ScuteIdentifier>("");
  const [isFatalError, setIsFatalError] = useState(false);

  const [magicLinkId, setMagicLinkId] = useState<UniqueIdentifier>();
  const [authPayload, setAuthPayload] = useState<ScuteTokenPayload>();

  const [_authView, setAuthView] = useState<Views>(() => {
    if (
      typeof window !== "undefined" &&
      typeof URLSearchParams !== "undefined" &&
      new URL(window.location.href).searchParams.has(SCUTE_MAGIC_PARAM)
    ) {
      return VIEWS.MAGIC_LOADING;
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
  };

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
    case VIEWS.WEBAUTHN_REGISTER:
      if (!authPayload) return null;

      return (
        <Container {...containerProps}>
          <RegisterDevice
            scuteClient={scuteClient}
            identifier={identifier}
            setAuthView={setAuthView}
            setIsFatalError={setIsFatalError}
            webauthn={webauthn}
            authPayload={authPayload}
          />
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
            getAuthPayloadCallback={(payload) => setAuthPayload(payload)}
            magicLinkId={magicLinkId}
            isWebauthnNewDevice={authView === VIEWS.MAGIC_NEW_DEVICE_PENDING}
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
}

const Container = ({
  scuteClient,
  appData,
  appearance,
  webauthn,
  children,
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
      <ElementCard>
        <Content>{children}</Content>
        {appData?.scute_branding !== false ? (
          <Flex css={{ jc: "center", pb: "$1" }}>
            <FooterCredits>
              <span>powered by</span>
              <span>
                <Logo
                  webauthnAvailable={
                    webauthn !== "disabled" && scuteClient.isWebauthnSupported()
                  }
                />
                scute
              </span>
            </FooterCredits>
          </Flex>
        ) : null}
      </ElementCard>
    </Layout>
  );
};

export default Auth;
