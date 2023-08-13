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
  Layout,
  Logo,
} from "./components";
import { createTheme } from "./stitches.config";
import {
  SignInOrUp,
  RegisterDevice,
  VerifyDevice,
  VerifyMagicLinkOtp,
  FatalErrorView,
} from "./views";

export type AuthProps = {
  scuteClient: ScuteClient;
  onSignIn?: () => void;
  onSignOut?: () => void;
  view?: Extract<Views, "sign-in-or-up" | "sign-in" | "sign-up">;
  webauthn?: ScuteWebauthnOption;
  appearance?: {
    theme?: Theme;
    scuteBranding?: boolean;
  };
};

function Auth(props: AuthProps) {
  const {
    scuteClient,
    appearance: _appearance,
    view = VIEWS.SIGN_IN_OR_UP,
    webauthn = "optional",
    onSignIn,
    onSignOut,
  } = props;

  const [identifier, setIdentifier] = useState<ScuteIdentifier>("");

  const [isFatalError, setIsFatalError] = useState(false);

  const [magicLinkId, setMagicLinkId] = useState<UniqueIdentifier>();
  const [authPayload, setAuthPayload] = useState<ScuteTokenPayload>();

  const [_authView, setAuthView] = useState<Views>(() => {
    if (
      typeof window !== "undefined" &&
      new URL(window.location.href).searchParams.has(SCUTE_MAGIC_PARAM)
    ) {
      return VIEWS.MAGIC_LOADING;
    }

    return view;
  });

  const authView = _authView === VIEWS.SIGN_IN_OR_UP ? view : _authView;

  const appearance: AuthProps["appearance"] = {
    // defaults
    scuteBranding: true,
    // client preferences
    ..._appearance,
  };
  const containerProps: AuthProps = { ...props, appearance };

  const [appData, _setAppData] = useState<ScuteAppData>();

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
        onSignOut?.();
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
  }, [scuteClient, onSignIn, onSignOut, view]);

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
    return null;
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

const Container = ({
  scuteClient,
  appearance,
  webauthn,
  children,
}: AuthProps & { children: React.ReactNode }) => {
  return (
    <Layout className={appearance?.theme ? createTheme(appearance.theme) : ""}>
      <ElementCard>
        <Content>{children}</Content>
        {appearance?.scuteBranding ? (
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
