import { useState, useEffect } from "react";
import {
  AUTH_CHANGE_EVENTS,
  AuthContextProvider,
  ScuteClient,
  useAuth,
  type ScuteClientConfig,
} from "@scute/react";
import { VIEWS, type Views } from "@scute/ui-shared";
import useInterval from "./helpers/useInterval";
import {
  Login,
  MagicLoading,
  MagicPending,
  BioRegister,
  BioVerify,
  Error,
} from "./views";
import {
  Content,
  ElementCard,
  Flex,
  FooterCredits,
  Layout,
  Logo,
} from "./components";

export type AuthProps = {
  onSignIn?: () => void;
  onSignOut?: () => void;
} & (
  | {
      scuteClient?: undefined;
      scuteClientConfig: ScuteClientConfig;
    }
  | {
      scuteClient: ScuteClient;
      scuteClientConfig?: undefined;
    }
);

function Auth({
  scuteClient: _scuteClient,
  scuteClientConfig,
  onSignIn,
  onSignOut,
}: AuthProps) {
  const [scuteClient] = useState(
    () => _scuteClient ?? new ScuteClient(scuteClientConfig)
  );

  const [email, setEmail] = useState("");
  const [error, setError] = useState<any>(null);
  const [magicLinkId, setMagicLinkId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [authView, setAuthView] = useState<Views>();
  const [authInitialData, setAuthInitialData] = useState<any>();

  useEffect(() => {
    setAuthView(VIEWS.LOGIN);

    const unsubscribe = scuteClient.onAuthStateChange(async (event) => {
      if (event === AUTH_CHANGE_EVENTS.SIGN_IN) {
        onSignIn?.();
      } else if (event === AUTH_CHANGE_EVENTS.SIGN_OUT) {
        onSignOut?.();
      } else if (event === AUTH_CHANGE_EVENTS.MAGIC_PENDING) {
        setAuthView(VIEWS.MAGIC_PENDING);
      } else if (event === AUTH_CHANGE_EVENTS.MAGIC_LOADING) {
        setAuthView(VIEWS.MAGIC_LOADING);
      } else if (event === AUTH_CHANGE_EVENTS.BIO_REGISTER) {
        setAuthView(VIEWS.BIO_REGISTER);
      } else if (event === AUTH_CHANGE_EVENTS.BIO_VERIFY) {
        setAuthView(VIEWS.BIO_VERIFY);
      }
    });

    (async () => {
      const { data, error } = await scuteClient.initialize();
      if (error) {
        setError(error);
        return;
      }

      setAuthInitialData(data);
    })();

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    const { data, error } = await scuteClient.login(email);

    if (error) {
      setError(error);
      return;
    }

    const magicLinkId = data?.id;

    if (magicLinkId) {
      setMagicLinkId(magicLinkId);
      setAuthView(VIEWS.MAGIC_PENDING);
      setIsPolling(true);
    }
  };

  useEffect(() => {
    setIsPolling(authView === VIEWS.MAGIC_PENDING);
  }, [authView]);

  useInterval(
    async () => {
      if (magicLinkId) {
        const { error } = await scuteClient.loginWithMagicLinkId(magicLinkId);
        if (!error) {
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
    <Layout>
      <ElementCard>
        <Content>
          {authView && !error ? (
            {
              [VIEWS.LOGIN]: (
                // TODO: email validation
                <Login
                  email={email}
                  handleEmailChange={(
                    event: React.ChangeEvent<HTMLInputElement>
                  ) => setEmail(event.target.value)}
                  handleLogin={handleLogin}
                  maybeWebauthn={scuteClient.isWebauthnAvailable}
                />
              ),
              [VIEWS.BIO_REGISTER]: (
                <BioRegister
                  scuteClient={scuteClient}
                  email={email}
                  setAuthView={setAuthView}
                  isWebauthnOptional={
                    scuteClient.tempOptions.webauthn === "optional"
                  }
                  skipAndLogin={async () => {
                    const { error } = await scuteClient.loginWithTokenPayload(
                      authInitialData.payload
                    );
                    if (error) {
                      setError(error);
                    }
                  }}
                  registerDevice={async () => {
                    const { error } = await scuteClient.loginWithRegisterDevice(
                      authInitialData.options
                    );

                    if (error) {
                      const { error } = await scuteClient.loginWithTokenPayload(
                        authInitialData.payload
                      );
                      if (error) {
                        setError(error);
                      }
                    }
                  }}
                />
              ),
              [VIEWS.BIO_VERIFY]: (
                <BioVerify
                  scuteClient={scuteClient}
                  email={email}
                  setAuthView={setAuthView}
                />
              ),
              [VIEWS.MAGIC_PENDING]: (
                <MagicPending
                  scuteClient={scuteClient}
                  email={email}
                  setAuthView={setAuthView}
                />
              ),
              [VIEWS.MAGIC_LOADING]: (
                <MagicLoading
                  scuteClient={scuteClient}
                  email={email}
                  setAuthView={setAuthView}
                />
              ),
            }[authView]
          ) : (
            <Error
              scuteClient={scuteClient}
              email={email}
              error={error}
              setError={setError}
              setAuthView={setAuthView}
            />
          )}
        </Content>
        <Flex css={{ jc: "center", pb: "$1" }}>
          <FooterCredits>
            <span>powered by</span>{" "}
            <span>
              <Logo webauthnSupport={scuteClient.isWebauthnAvailable} /> scute
            </span>
          </FooterCredits>
        </Flex>
      </ElementCard>
    </Layout>
  );
}

Auth.ContextProvider = AuthContextProvider;
Auth.useAuth = useAuth;

export default Auth;
