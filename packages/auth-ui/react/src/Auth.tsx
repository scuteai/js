import { useState, useEffect, useCallback } from "react";
import {
  AUTH_CHANGE_EVENTS,
  AuthContextProvider,
  ScuteClient,
  useAuth,
  type UniqueIdentifier,
  ScuteError,
  getMeaningfulError,
  useScuteClient,
  SCUTE_MAGIC_PARAM,
  type ScuteTokenPayload,
  type ScuteWebauthnOption,
  type ScuteIdentifier,
} from "@scute/react";

import { type Theme, VIEWS, type Views } from "@scute/ui-shared";
import useInterval from "./helpers/useInterval";
import {
  SignInOrUp,
  MagicLoading,
  MagicPending,
  BioRegister,
  BioVerify,
  ErrorView,
  MagicNewDevicePending,
} from "./views";
import {
  Content,
  ElementCard,
  Flex,
  FooterCredits,
  Layout,
  Logo,
} from "./components";
import { isValidEmail } from "./helpers/isValidEmail";
import debounce from "lodash.debounce";
import jwtDecode from "jwt-decode";
import { createTheme } from "./stitches.config";

export type AuthProps = {
  scuteClient: ScuteClient;
  onSignIn?: () => void;
  onSignOut?: () => void;
  authView?: Views;
  webauthn?: ScuteWebauthnOption;
  appearance?: {
    theme?: Theme;
    scuteBranding?: boolean;
  };
};

function Auth({
  scuteClient,
  appearance: _appearance,
  authView: _authView = undefined, // needs to be undefined default
  webauthn = "optional",
  onSignIn,
  onSignOut,
}: AuthProps) {
  const [identifier, setIdentifier] = useState("");
  const [identifierError, setIdentifierError] = useState<string | null>(null);

  const handleValidateIdentifier = (identifier: string) => {
    if (!isValidEmail(identifier)) {
      setIdentifierError("Identifier is invalid");
    } else {
      setIdentifierError(null);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedIsValidIdentifier = useCallback(
    debounce(handleValidateIdentifier, 1000),
    []
  );
  useEffect(() => {
    debouncedIsValidIdentifier.cancel();
  }, [debouncedIsValidIdentifier]);

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setIdentifier(value);
    setError(null);
    setIdentifierError(null);
    debouncedIsValidIdentifier(value);
  };

  const [authView, _setAuthView] = useState<Views | undefined>(_authView);
  const setAuthView: typeof _setAuthView = (...args) => {
    if (error) setError(null);
    _setAuthView(...args);
  };

  const [error, setError] = useState<ScuteError | null>(null);
  const meaningfulError = error ? getMeaningfulError(error) : null;

  const [magicLinkId, setMagicLinkId] = useState<UniqueIdentifier | null>(null);
  const [magicLinkTokenAuthPayload, setMagicLinkTokenAuthPayload] =
    useState<ScuteTokenPayload>();

  const [isPolling, setIsPolling] = useState(false);

  const [rememberedIdentifier, setRememberedIdentifier] =
    useState<ScuteIdentifier | null>(null);

  useEffect(() => {
    scuteClient
      .getRememberedIdentifier()
      .then((identifier) => setRememberedIdentifier(identifier));
  }, [scuteClient]);

  const appearance: AuthProps["appearance"] = {
    // defaults
    scuteBranding: true,
    // client preferences
    ..._appearance,
  };

  const handleSignInOrUp = async () => {
    let _identifier = identifier;
    // set remembered user identifier if direct click on the login
    // without breaking identifier typing
    if (!identifier && rememberedIdentifier) {
      _identifier = rememberedIdentifier;
      setIdentifier(_identifier);
    }

    const { data: pollingData, error: signInOrUpError } =
      await scuteClient.signInOrUp(_identifier);

    if (signInOrUpError) {
      setError(signInOrUpError);
      return;
    }

    if (pollingData) {
      setMagicLinkId(pollingData.magic_link.id);
      setIsPolling(true);
    }
  };

  useEffect(() => {
    if (!authView) {
      setAuthView(VIEWS.SIGN_IN_OR_UP);
    }

    const unsubscribe = scuteClient.onAuthStateChange(async (event) => {
      if (event === AUTH_CHANGE_EVENTS.SIGN_IN) {
        onSignIn?.();
      } else if (event === AUTH_CHANGE_EVENTS.SIGN_OUT) {
        onSignOut?.();
      } else if (event === AUTH_CHANGE_EVENTS.MAGIC_PENDING) {
        setAuthView(VIEWS.MAGIC_PENDING);
      } else if (event === AUTH_CHANGE_EVENTS.MAGIC_NEW_DEVICE_PENDING) {
        setAuthView(VIEWS.MAGIC_NEW_DEVICE_PENDING);
      } else if (event === AUTH_CHANGE_EVENTS.MAGIC_LOADING) {
        setAuthView(VIEWS.MAGIC_LOADING);
      } else if (event === AUTH_CHANGE_EVENTS.BIO_REGISTER) {
        setAuthView(VIEWS.BIO_REGISTER);
      } else if (event === AUTH_CHANGE_EVENTS.BIO_VERIFY) {
        setAuthView(VIEWS.BIO_VERIFY);
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scuteClient, onSignIn, onSignOut]);

  useEffect(() => {
    (async () => {
      // get session from url (sct_magic)
      const url = new URL(window.location.href);

      if (url.searchParams.has(SCUTE_MAGIC_PARAM)) {
        const magicToken = url.searchParams.get(SCUTE_MAGIC_PARAM)!;

        let magicTokenPayload: { webauthnEnabled: boolean };
        try {
          magicTokenPayload = jwtDecode<typeof magicTokenPayload>(magicToken);
        } catch {}

        if (magicTokenPayload!) {
          setAuthView(VIEWS.MAGIC_LOADING);

          const isWebauthnAvailable =
            scuteClient.isWebauthnSupported() &&
            magicTokenPayload.webauthnEnabled !== false;

          const {
            data: magicLinkTokenAuthPayload,
            error: verifyMagicLinkError,
          } = await scuteClient.verifyMagicLink(magicToken);

          if (verifyMagicLinkError) {
            setError(verifyMagicLinkError);
            return;
          }

          setMagicLinkTokenAuthPayload(magicLinkTokenAuthPayload);

          if (isWebauthnAvailable) {
            setAuthView(VIEWS.BIO_REGISTER);
          } else {
            setAuthView(VIEWS.MAGIC_LOADING);
            scuteClient.signInWithTokenPayload(magicLinkTokenAuthPayload);
          }
        }

        url.searchParams.delete(SCUTE_MAGIC_PARAM);
        window.history.replaceState(window.history.state, "", url.toString());
      }
    })();
  }, []);

  useEffect(() => {
    setIsPolling(
      authView === VIEWS.MAGIC_PENDING ||
        authView === VIEWS.MAGIC_NEW_DEVICE_PENDING
    );
  }, [authView]);

  useInterval(
    async () => {
      if (magicLinkId) {
        const { error: magicLinkIdLoginError } =
          await scuteClient.signInWithMagicLinkId(magicLinkId);

        if (!magicLinkIdLoginError) {
          setIsPolling(false);
        }
      }
    },
    isPolling ? 5000 : null
  );

  if (!authView) {
    return null;
  }

  return (
    <Layout className={appearance?.theme ? createTheme(appearance.theme) : ""}>
      <ElementCard>
        <Content>
          {authView && !meaningfulError?.isFatal ? (
            {
              [VIEWS.SIGN_IN_OR_UP]: (
                <SignInOrUp
                  scuteClient={scuteClient}
                  identifier={identifier}
                  handleEmailChange={handleEmailChange}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message || identifierError}
                  handleSignInOrUp={handleSignInOrUp}
                  webauthnAvailable={
                    webauthn !== "disabled" && scuteClient.isWebauthnSupported()
                  }
                  rememberedIdentifier={rememberedIdentifier}
                  resetRememberedIdentifier={() =>
                    setRememberedIdentifier(null)
                  }
                />
              ),
              [VIEWS.BIO_REGISTER]: (
                <BioRegister
                  scuteClient={scuteClient}
                  identifier={identifier}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message}
                  isWebauthnOptional={webauthn === "optional"}
                  skipAndLogin={() =>
                    scuteClient.signInWithTokenPayload(
                      magicLinkTokenAuthPayload!
                    )
                  }
                  registerDevice={async () => {
                    const { error: registerDeviceError } =
                      await scuteClient.signInWithRegisterDevice(
                        magicLinkTokenAuthPayload!
                      );

                    if (registerDeviceError) {
                      setError(registerDeviceError);
                    }
                  }}
                />
              ),
              [VIEWS.BIO_VERIFY]: (
                <BioVerify
                  scuteClient={scuteClient}
                  identifier={identifier}
                  setAuthView={setAuthView}
                  sendMagicLink={() =>
                    scuteClient.sendLoginMagicLink(identifier)
                  }
                  error={meaningfulError?.message}
                />
              ),
              [VIEWS.MAGIC_PENDING]: (
                <MagicPending
                  scuteClient={scuteClient}
                  identifier={identifier}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message}
                />
              ),
              [VIEWS.MAGIC_NEW_DEVICE_PENDING]: (
                <MagicNewDevicePending
                  scuteClient={scuteClient}
                  identifier={identifier}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message}
                  resendAllowed={true}
                  resendEmail={() => null}
                />
              ),
              [VIEWS.MAGIC_LOADING]: (
                <MagicLoading
                  scuteClient={scuteClient}
                  identifier={identifier}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message}
                  resendAllowed={true}
                  resendEmail={() => null}
                />
              ),
            }[authView]
          ) : (
            <ErrorView
              scuteClient={scuteClient}
              identifier={identifier}
              error={error}
              setError={setError}
              setAuthView={setAuthView}
            />
          )}
        </Content>
        {appearance.scuteBranding ? (
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
}

Auth.ContextProvider = AuthContextProvider;
Auth.useAuth = useAuth;
Auth.useScuteClient = useScuteClient;

export default Auth;
