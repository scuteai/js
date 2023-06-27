import { useState, useEffect, useCallback } from "react";
import {
  AUTH_CHANGE_EVENTS,
  AuthContextProvider,
  ScuteClient,
  useAuth,
  type UniqueIdentifier,
  type ScuteTokenPayloadUser,
  isWebauthnSupported,
  ScuteError,
  getMeaningfulError,
  useScuteClient,
} from "@scute/react";
import { type Theme, VIEWS, type Views } from "@scute/ui-shared";
import useInterval from "./helpers/useInterval";
import {
  SignIn,
  SignUp,
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
import { createTheme } from "./stitches.config";

export type AuthProps = {
  scuteClient: ScuteClient;
  onSignIn?: () => void;
  onSignOut?: () => void;
  authView?: Views;
  webauthn?: "strict" | "optional" | "disabled";
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
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleValidateEmail = (email: string) => {
    if (!isValidEmail(email)) {
      setEmailError("Email is invalid");
    } else {
      setEmailError(null);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedIsValidEmail = useCallback(
    debounce(handleValidateEmail, 1000),
    []
  );
  useEffect(() => {
    debouncedIsValidEmail.cancel();
  }, [debouncedIsValidEmail]);

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setEmail(value);
    setError(null);
    setEmailError(null);
    debouncedIsValidEmail(value);
  };

  const [rememberedUser, setRememberedUser] =
    useState<ScuteTokenPayloadUser | null>();

  useEffect(() => {
    scuteClient.getRememberedUser().then((user) => setRememberedUser(user));
  }, [scuteClient]);

  const [authView, _setAuthView] = useState<Views | undefined>(_authView);
  const setAuthView: typeof _setAuthView = (...args) => {
    if (error) setError(null);
    _setAuthView(...args);
  };

  const [error, setError] = useState<ScuteError | null>(null);
  const meaningfulError = error ? getMeaningfulError(error) : null;

  const [magicLinkId, setMagicLinkId] = useState<UniqueIdentifier | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const [authInitialData, setAuthInitialData] =
    useState<Awaited<ReturnType<typeof scuteClient.initialize>>["data"]>();

  const appearance: AuthProps["appearance"] = {
    // defaults
    scuteBranding: true,
    // client preferences
    ..._appearance,
  };

  const handleSignIn = async () => {
    let _email = email;
    // set remembered user email if direct click on the login
    // without breaking email typing
    if (!email && rememberedUser?.email) {
      _email = rememberedUser.email;
      setEmail(_email);
    }
    const { data, error: signInError } = await scuteClient.signInWithEmail(
      _email,
      webauthn
    );

    if (signInError) {
      setError(signInError);
      return;
    }

    const magicLinkId = data?.id;
    if (magicLinkId) {
      setMagicLinkId(magicLinkId);
      setIsPolling(true);
    }
  };

  const handleSignUp = async () => {
    const { data, error: signUpError } = await scuteClient.signUpWithEmail(
      email
    );

    if (signUpError) {
      setError(signUpError);
      return;
    }

    const magicLinkId = data?.id;
    if (magicLinkId) {
      setMagicLinkId(magicLinkId);
      setIsPolling(true);
    }
  };

  useEffect(() => {
    if (!authView) {
      setAuthView(VIEWS.SIGN_IN);
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

    (async () => {
      const { data, error: initializError } = await scuteClient.initialize();

      if (initializError) {
        setError(initializError);
        return;
      }

      setAuthInitialData(data);
    })();

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scuteClient, onSignIn, onSignOut]);

  useEffect(() => {
    setIsPolling(
      authView === VIEWS.MAGIC_PENDING ||
        authView === VIEWS.MAGIC_NEW_DEVICE_PENDING
    );
  }, [authView]);

  useInterval(
    async () => {
      if (magicLinkId) {
        const { error: magicLinkClaimError } =
          await scuteClient.signInWithMagicLinkId(magicLinkId);
        if (!magicLinkClaimError) {
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
              [VIEWS.SIGN_IN]: (
                <SignIn
                  scuteClient={scuteClient}
                  email={email}
                  handleEmailChange={handleEmailChange}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message || emailError}
                  handleSignIn={handleSignIn}
                  webauthnAvailable={
                    webauthn !== "disabled" && isWebauthnSupported()
                  }
                  rememberedUser={rememberedUser}
                  resetRememberedUser={() => setRememberedUser(null)}
                />
              ),
              [VIEWS.SIGN_UP]: (
                <SignUp
                  scuteClient={scuteClient}
                  email={email}
                  handleEmailChange={handleEmailChange}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message || emailError}
                  handleSignUp={handleSignUp}
                  webauthnAvailable={
                    webauthn !== "disabled" && isWebauthnSupported()
                  }
                />
              ),
              [VIEWS.BIO_REGISTER]: (
                <BioRegister
                  scuteClient={scuteClient}
                  email={email}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message}
                  isWebauthnOptional={webauthn === "optional"}
                  skipAndLogin={async () => {
                    const payload = authInitialData?.payload;
                    if (!payload) {
                      setError(
                        new ScuteError({ message: "Something went wrong." })
                      );
                      return;
                    }

                    const { error: signInError } =
                      await scuteClient.signInWithTokenPayload(payload);

                    if (signInError) {
                      setError(signInError);
                    }
                  }}
                  registerDevice={async () => {
                    const { options, payload } = authInitialData || {};
                    if (!(options && payload)) {
                      setError(
                        new ScuteError({ message: "Something went wrong." })
                      );
                      return;
                    }

                    const { error: registerDeviceError } =
                      await scuteClient.signInWithRegisterDevice(
                        options as any
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
                  email={email}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message}
                />
              ),
              [VIEWS.MAGIC_PENDING]: (
                <MagicPending
                  scuteClient={scuteClient}
                  email={email}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message}
                />
              ),
              [VIEWS.MAGIC_NEW_DEVICE_PENDING]: (
                <MagicNewDevicePending
                  scuteClient={scuteClient}
                  email={email}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message}
                />
              ),
              [VIEWS.MAGIC_LOADING]: (
                <MagicLoading
                  scuteClient={scuteClient}
                  email={email}
                  setAuthView={setAuthView}
                  error={meaningfulError?.message}
                />
              ),
            }[authView]
          ) : (
            <ErrorView
              scuteClient={scuteClient}
              email={email}
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
                    webauthn !== "disabled" && isWebauthnSupported()
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
