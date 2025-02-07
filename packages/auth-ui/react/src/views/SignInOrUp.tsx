import {
  type ScuteClient,
  type ScuteAppData,
  type ScuteIdentifier,
  type UniqueIdentifier,
  type ScuteIdentifierType,
  type ScuteTokenPayload,
  getMeaningfulError,
  IdentifierAlreadyExistsError,
  IdentifierNotRecognizedError,
  UnknownSignInError,
} from "@scute/core";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ArrowIcon } from "../assets/icons";
import type { CommonViewProps } from "./common";
import {
  Button,
  Flex,
  Group,
  Heading,
  Inner,
  Text,
  IconHolder,
  Panel,
  ElementCardFooter,
  QueryContainer,
  ResponsiveContainer,
  ResponsiveLeft,
  ResponsiveRight,
} from "../components";

import { getIdentifierType } from "../helpers/identifierType";
import { VIEWS } from "@scute/ui-shared";
import { translateError } from "../helpers/i18n/service";
import { RegisterForm } from "./RegisterForm";
import { FloatingLabelIdField } from "../components/FloatingLabelTextField";
import { getISO2CountryCode, isValidPhoneNumber } from "../helpers/phone";

import { FlagImage } from "react-international-phone";

export interface SignInOrUpProps extends Omit<CommonViewProps, "identifier"> {
  identifier: ScuteIdentifier;
  setIdentifier: React.Dispatch<React.SetStateAction<ScuteIdentifier>>;
  mode?: "sign_in" | "sign_up" | "sign_in_or_up" | "confirm_invite";
  appData: ScuteAppData;
  webauthnEnabled?: boolean;
  policyURLs?: {
    privacyPolicy?: string;
    termsOfService?: string;
  };
  getMagicLinkIdCallback?: (magicLinkId: UniqueIdentifier) => void;
  getAuthPayloadCallback?: (payload: ScuteTokenPayload) => void;
}

const SignInOrUp = (props: SignInOrUpProps) => {
  const {
    scuteClient,
    identifier,
    setIdentifier,
    setAuthView,
    appData,
    mode: __mode = "sign_in_or_up",
    webauthnEnabled = true,
    setIsFatalError,
    getMagicLinkIdCallback,
    policyURLs,
  } = props;

  const { t } = useTranslation();

  const isPhone = isValidPhoneNumber(identifier, t) === true;

  const providers = appData.oauth_providers || [];

  const googleProvider = providers.find(
    (provider) => provider.provider === "google"
  );

  const otherProviders = providers
    .filter((provider) => provider.provider !== "google")
    .slice(0, 4);

  const [_mode, _setMode] =
    useState<NonNullable<SignInOrUpProps["mode"]>>(__mode);

  const mode =
    appData.public_signup !== false || _mode === "confirm_invite"
      ? _mode
      : "sign_in";

  const [shouldSkipRegisterForm] = useState(
    () =>
      appData.allowed_identifiers.length === 1 &&
      appData.user_meta_data_schema.length === 0
  );

  const [showRegisterForm, setShowRegisterForm] = useState(
    mode === "confirm_invite" ? true : false
  );

  const backToLogin = () => {
    _setMode("sign_in_or_up");
    setShowRegisterForm(false);
  };

  const registerFormProps: RegisterFormProps = {
    ...props,
    mode,
    backToLogin,
    shouldSkipRegisterForm,
  };

  const {
    signInOrUpText,
    allowedIdentifiers,
    identifierLabelText,
    isEmailIdentifierAllowed,
    isPhoneIdentifierAllowed,
  } = useSignInOrUpFormHelpers(identifier, appData, mode);

  const [rememberedIdentifier, setRememberedIdentifier] =
    useRememberedIdentifier(scuteClient);

  const isWebauthnAvailable =
    webauthnEnabled && scuteClient.isWebauthnSupported();

  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<boolean | string>(
    t("signInOrUp.identifierRequired")
  );

  const [rememberedIdentifierISO2Code, setRememberedIdentifierISO2Code] =
    useState<string | null>(null);

  useEffect(() => {
    if (rememberedIdentifier) {
      setError(false);
      setIdentifier(rememberedIdentifier);
      if (isValidPhoneNumber(rememberedIdentifier, t) === true) {
        const countryIso2 = getISO2CountryCode(rememberedIdentifier);
        if (countryIso2) {
          setRememberedIdentifierISO2Code(countryIso2.toLowerCase());
        }
      }
    }
  }, [rememberedIdentifier]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsDirty(true);
    if (error) {
      return;
    }
    const user = await scuteClient.identifierExists(identifier);

    if (!user && mode === "sign_in") {
      const error = new IdentifierNotRecognizedError();
      setError(translateError(error));
      return;
    } else if (user && mode === "sign_up") {
      const error = new IdentifierAlreadyExistsError();
      setError(translateError(error));
      return;
    }

    if (user) {
      if (user.status === "inactive") {
        // TODO
        const error = new UnknownSignInError();
        setError(translateError(error));
        return;
      }

      // login
      if (webauthnEnabled && user.webauthn_enabled) {
        return setAuthView(VIEWS.WEBAUTHN_VERIFY);
      }

      if (isPhone) {
        const { error: otpError } = await scuteClient.sendLoginOtp(identifier);

        if (otpError) {
          const { isFatal } = getMeaningfulError(otpError);
          setIsFatalError?.(isFatal);
          setError(translateError(otpError));
          return;
        }
      } else {
        const { data, error: magicLinkError } =
          await scuteClient.sendLoginMagicLink(identifier);

        if (magicLinkError) {
          const { isFatal } = getMeaningfulError(magicLinkError);
          setIsFatalError?.(isFatal);
          setError(translateError(magicLinkError));
          return;
        }

        getMagicLinkIdCallback?.(data.magic_link.id);
      }
    } else {
      // register
      if (!shouldSkipRegisterForm) {
        setShowRegisterForm(true);
      } else {
        const { data: pollingData, error: signUpError } =
          await scuteClient.signUp(identifier);

        if (signUpError) {
          const { isFatal } = getMeaningfulError(signUpError);
          setIsFatalError?.(isFatal);
          setError(translateError(signUpError));
          return;
        }

        if (pollingData) {
          if ("magic_link" in pollingData) {
            const magicLinkId = pollingData.magic_link.id;
            getMagicLinkIdCallback?.(magicLinkId);
          }
        }
      }
    }
  };
  return (
    <>
      {!showRegisterForm ? (
        <form noValidate onSubmit={onSubmit}>
          <QueryContainer css={{ pt: "0px", pb: "$2" }}>
            <ResponsiveContainer>
              <ResponsiveLeft>
                <Inner
                  css={{
                    display: "flex",
                    flexDirection: "column",
                    ta: "center",
                    "@container queryContainer (min-width: 950px)": {
                      ta: "left",
                    },
                  }}
                >
                  {mode !== "sign_up" && rememberedIdentifier ? (
                    <Heading size="4">{t("signInOrUp.welcomeBack")}</Heading>
                  ) : (
                    <Heading size="4">{signInOrUpText}</Heading>
                  )}
                  <Text size="2" css={{ mb: "$4" }}>
                    {t("signInOrUp.continueTo", { appName: appData.name })}
                  </Text>
                </Inner>
              </ResponsiveLeft>
              <ResponsiveRight>
                <Inner>
                  {mode !== "sign_up" && rememberedIdentifier ? (
                    <>
                      <Panel
                        css={{
                          px: "$3",
                          py: "$5",
                          mt: "$4",
                          mb: "$7",
                          ta: "left",
                          "@container queryContainer (max-width: 600px)": {
                            mt: "$1",
                            mb: "$4",
                            px: "$2",
                            py: "$3",
                          },
                        }}
                      >
                        <Flex
                          gap={2}
                          css={{
                            ai: "center",
                            "@container queryContainer (max-width: 470px)": {
                              display: "block",
                            },
                          }}
                        >
                          <Flex
                            css={{
                              fd: "column",
                              width: "calc(100% - 155px)",
                              "@container queryContainer (max-width: 470px)": {
                                width: "100%",
                              },
                            }}
                          >
                            <Text
                              size="4"
                              css={{ mb: "$1", pl: "$2" }}
                              variant="inherit"
                            >
                              {t("signInOrUp.signInAs")}
                            </Text>
                            <Text
                              size="5"
                              css={{
                                pl: "$2",
                                overflow: "hidden",
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                              }}
                              variant="inherit"
                            >
                              {rememberedIdentifierISO2Code && (
                                <FlagImage
                                  iso2={rememberedIdentifierISO2Code}
                                  style={{
                                    position: "relative",
                                    top: 5,
                                    marginRight: 4,
                                  }}
                                />
                              )}
                              {rememberedIdentifier}
                            </Text>
                          </Flex>
                          <Button
                            variant="alt"
                            onClick={() => setRememberedIdentifier(null)}
                            css={{
                              width: "140px",
                              "@container queryContainer (max-width: 470px)": {
                                width: "100%",
                                mt: "$4",
                              },
                            }}
                          >
                            {t("signInOrUp.changeUser")}
                          </Button>
                        </Flex>
                      </Panel>
                    </>
                  ) : (
                    <>
                      <Group css={{ mt: "$2" }}>
                        <FloatingLabelIdField
                          domId="email_field__floating_label"
                          label={identifierLabelText}
                          autoCorrect="off"
                          autoCapitalize="none"
                          autoComplete={`webauthn ${
                            isEmailIdentifierAllowed ? "email" : ""
                          }${isPhoneIdentifierAllowed ? "tel" : ""}`}
                          fieldType="text"
                          allowedIdentifiers={allowedIdentifiers}
                          onChange={setIdentifier}
                          isDirty={isDirty}
                          t={t}
                          error={error}
                          setError={setError}
                          identifier={identifier}
                          setIdentifier={setIdentifier}
                        />
                      </Group>
                    </>
                  )}

                  <Flex css={{ mb: "$3" }}>
                    {rememberedIdentifier ? (
                      <Button size="2" type="submit">
                        <span>{t("signInOrUp.signIn")}</span>
                        <ArrowIcon className="right" />
                      </Button>
                    ) : (
                      <Button size="2" type="submit">
                        <span>{t("signInOrUp.signInOrUp")}</span>
                        <ArrowIcon className="right" />
                      </Button>
                    )}
                  </Flex>
                  {providers.length > 0 && (
                    <Flex
                      justify="center"
                      css={{
                        pb: "$3",
                        fontSize: "$4",
                        fontWeight: 500,
                        color: "$cardBodyText",
                      }}
                    >
                      <span>{t("signInOrUp.or")}</span>
                    </Flex>
                  )}
                  <Flex>
                    {googleProvider && (
                      <Button
                        key={googleProvider.provider}
                        size="2"
                        style={{ marginBottom: 16 }}
                        variant="social"
                        type="button"
                        onClick={() => {
                          scuteClient.signInWithOAuthProvider(
                            googleProvider.provider
                          );
                        }}
                      >
                        <span>
                          {t("signInOrUp.continueWith", {
                            provider: googleProvider.name,
                          })}
                        </span>
                        <IconHolder
                          css={{
                            position: "absolute",
                            top: 16,
                            left: 21,
                            height: 34,
                            paddingTop: 5,
                            "@container queryContainer (max-width: 470px)": {
                              top: 8,
                            },
                          }}
                        >
                          <img
                            src={`${scuteClient.baseUrl}/${googleProvider.icon}`}
                            alt={googleProvider.name}
                            width="24"
                            height="24"
                          />
                        </IconHolder>
                      </Button>
                    )}
                  </Flex>
                  <Flex
                    direction={providers.length < 4 ? "column" : "row"}
                    align="center"
                  >
                    {otherProviders.map((provider, index) => (
                      <>
                        {index > 0 && providers.length > 3 && (
                          <div style={{ width: 22 }}></div>
                        )}
                        <Button
                          key={provider.provider}
                          size="2"
                          variant="social"
                          style={
                            providers.length < 4
                              ? { marginBottom: 16 }
                              : {
                                  marginBottom: 16,
                                  width: "auto",
                                  flexGrow: 1,
                                  padding: 16,
                                }
                          }
                          type="button"
                          onClick={() => {
                            scuteClient.signInWithOAuthProvider(
                              provider.provider
                            );
                          }}
                        >
                          {providers.length < 4 && (
                            <span>
                              {t("signInOrUp.continueWith", {
                                provider: provider.name,
                              })}
                            </span>
                          )}
                          <IconHolder
                            style={
                              providers.length < 4
                                ? {
                                    position: "absolute",
                                    top: 16,
                                    left: 21,
                                    height: 34,
                                    paddingTop: 5,
                                  }
                                : { position: "relative", top: 5 }
                            }
                          >
                            <img
                              src={`${scuteClient.baseUrl}/${provider.icon}`}
                              alt={provider.name}
                              width="24"
                              height="24"
                            />
                          </IconHolder>
                        </Button>
                      </>
                    ))}
                  </Flex>
                </Inner>
              </ResponsiveRight>
            </ResponsiveContainer>
            <ElementCardFooter>
              To continue, Scute will share your name, email address, language
              preference, and profile picture with {appData.name} Before using
              this app, you can review {appData.name}'s{" "}
              <a href={policyURLs?.privacyPolicy ?? "#"}>privacy policy</a> and{" "}
              <a href={policyURLs?.termsOfService ?? "#"}>terms of service</a>.
            </ElementCardFooter>
          </QueryContainer>
        </form>
      ) : (
        <RegisterForm {...registerFormProps} />
      )}
    </>
  );
};

interface RegisterFormProps extends SignInOrUpProps {
  shouldSkipRegisterForm: boolean;
  backToLogin: () => void;
}

export const useSignInOrUpFormHelpers = (
  identifier: ScuteIdentifier,
  appData: ScuteAppData,
  mode: SignInOrUpProps["mode"]
) => {
  const { t } = useTranslation();
  // TODO: make use of this shit
  const allowedIdentifiers = appData.allowed_identifiers;
  const requiredIdentifiers = appData.required_identifiers;
  const isPublicSignUpAllowed = appData.public_signup !== false;
  const identifierType = getIdentifierType(identifier);

  let signInOrUpText = t("general.signInOrUp");
  if (!isPublicSignUpAllowed || mode === "sign_in") {
    signInOrUpText = t("general.logIn");
  } else if (mode === "sign_up") {
    signInOrUpText = t("general.signUp");
  }

  const isEmailIdentifierAllowed = allowedIdentifiers.includes("email");
  const isPhoneIdentifierAllowed = allowedIdentifiers.includes("phone");

  let identifierLabelText = t("general.yourEmail");
  if (isEmailIdentifierAllowed && isPhoneIdentifierAllowed) {
    identifierLabelText = t("general.emailOrPhone");
  } else if (isPhoneIdentifierAllowed) {
    identifierLabelText = t("general.yourPhone");
  }

  const maybeNeededIdentifierType: ScuteIdentifierType =
    identifierType === "email" ? "phone" : "email";
  const maybeNeededIdentifierLabel =
    maybeNeededIdentifierType === "email"
      ? t("general.yourEmail")
      : t("general.yourPhone");

  return {
    isPublicSignUpAllowed,
    signInOrUpText,
    identifierLabelText,
    allowedIdentifiers,
    requiredIdentifiers,
    isEmailIdentifierAllowed,
    isPhoneIdentifierAllowed,
    maybeNeededIdentifierType,
    maybeNeededIdentifierLabel,
  };
};

const useRememberedIdentifier = (scuteClient: ScuteClient) => {
  const state = useState<ScuteIdentifier | null>(null);
  const [_rememberedIdentifier, setRememberedIdentifier] = state;

  useEffect(() => {
    scuteClient
      .getRememberedIdentifier()
      .then((identifier) => setRememberedIdentifier(identifier));
  }, [scuteClient]);

  return state;
};

export default SignInOrUp;
