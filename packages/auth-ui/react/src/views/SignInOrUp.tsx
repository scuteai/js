import {
  type ScuteClient,
  type ScuteAppData,
  type ScuteIdentifier,
  type UniqueIdentifier,
  type ScuteIdentifierType,
  type ScuteMagicLinkIdResponse,
  type ScuteTokenPayload,
  decodeMagicLinkToken,
  SCUTE_MAGIC_PARAM,
  type ScuteError,
  getMeaningfulError,
  IdentifierAlreadyExistsError,
  IdentifierNotRecognizedError,
  UnknownSignInError,
} from "@scute/core";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import useEffectOnce from "../helpers/useEffectOnce";
import { FingerprintIcon, MagicMailIcon } from "../assets/icons";
import type { CommonViewProps } from "./common";
import {
  Button,
  Flex,
  Group,
  Heading,
  Inner,
  Label,
  Text,
  TextField,
  IconHolder,
  Panel,
  LargeSpinner,
  FloatingLabelTextField,
  ElementCardFooter,
  QueryContainer,
  ResponsiveContainer,
  ResponsiveLeft,
  ResponsiveRight,
} from "../components";

import { SubmitHandler, useForm, type FieldValues } from "react-hook-form";
import { getIdentifierType } from "../helpers/identifierType";
// import PhoneInput from "../components/PhoneInput";
import { VIEWS } from "@scute/ui-shared";
import { translateError } from "../helpers/i18n/service";

interface SignInOrUpProps extends Omit<CommonViewProps, "identifier"> {
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

type IdentifierInput = {
  identifier: ScuteIdentifier;
};

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

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isDirty, isValid },
  } = useForm<IdentifierInput>({
    criteriaMode: "all",
    defaultValues: {
      identifier: "",
    },
  });
  const isError = Object.keys(errors).length !== 0;

  const handleValidSubmit: SubmitHandler<IdentifierInput> = async (values) => {
    const identifier =
      values.identifier.length !== 0
        ? values.identifier
        : rememberedIdentifier ?? values.identifier;

    setIdentifier(identifier);
    const user = await scuteClient.identifierExists(identifier);

    if (!user && mode === "sign_in") {
      const error = new IdentifierNotRecognizedError();
      setError("root.serverError", {
        type: String(error.code),
        message: translateError(error),
      });

      return;
    } else if (user && mode === "sign_up") {
      const error = new IdentifierAlreadyExistsError();
      setError("root.serverError", {
        type: String(error.code),
        message: translateError(error),
      });
      return;
    }

    if (user) {
      if (user.status === "inactive") {
        // TODO
        const error = new UnknownSignInError();
        setError("root.serverError", {
          type: String(error.code),
          message: translateError(error),
        });
        return;
      }

      // login
      if (webauthnEnabled && user.webauthn_enabled) {
        setAuthView(VIEWS.WEBAUTHN_VERIFY);
      } else {
        const { data, error: magicLinkError } =
          await scuteClient.sendLoginMagicLink(identifier);

        if (magicLinkError) {
          const { isFatal } = getMeaningfulError(magicLinkError);
          setIsFatalError?.(isFatal);
          setError("root.serverError", {
            type: String(magicLinkError.code),
            message: translateError(magicLinkError),
          });
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
          setError("root.serverError", {
            type: String(signUpError.code),
            message: translateError(signUpError),
          });
          return;
        }

        if (pollingData) {
          const magicLinkId = pollingData.magic_link.id;
          getMagicLinkIdCallback?.(magicLinkId);
        }
      }
    }
  };

  return (
    <>
      {!showRegisterForm ? (
        <form
          noValidate
          onSubmit={handleSubmit(handleValidSubmit)}
          onChange={() => {
            clearErrors("root.serverError");
          }}
        >
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
                    {t("signInOrUp.continueTo", { appName: appData.name })}{" "}
                    Lorem ipsum dolor sit amet consectetur, adipisicing elit.
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
                        <FloatingLabelTextField
                          domId="email_field__floating_label"
                          label={identifierLabelText}
                          fieldType="email"
                          autoCorrect="off"
                          autoCapitalize="none"
                          autoComplete={`webauthn ${
                            isEmailIdentifierAllowed ? "email" : ""
                          }${isPhoneIdentifierAllowed ? "tel" : ""}`}
                          state={isError ? "invalid" : "valid"}
                          registerFormAttr={register("identifier", {
                            required: t("signInOrUp.identifierRequired"),
                            validate: {
                              maxLength: (v) => {
                                let isValidOrError: boolean | string = true;

                                if (allowedIdentifiers.includes("email")) {
                                  isValidOrError =
                                    v.length <= 50 ||
                                    t("signInOrUp.emailLimit");
                                }

                                if (allowedIdentifiers.includes("phone")) {
                                  const isValidPhoneOrError: boolean | string =
                                    true;
                                  isValidOrError =
                                    isValidPhoneOrError || isValidOrError;
                                }

                                return isValidOrError;
                              },
                              matchPattern: (v) => {
                                let isValidOrError: boolean | string = true;

                                if (allowedIdentifiers.includes("email")) {
                                  isValidOrError =
                                    /^\S+@\S+\.\S+$/.test(v) ||
                                    t("signInOrUp.emailValid");
                                }

                                if (allowedIdentifiers.includes("phone")) {
                                  const isValidPhoneOrError: boolean | string =
                                    true;
                                  isValidOrError =
                                    isValidPhoneOrError || isValidOrError;
                                }

                                return isValidOrError;
                              },
                            },
                          })}
                        />
                        {isError ? (
                          <Text
                            size="1"
                            css={{ color: "$errorColor", pt: "$2" }}
                          >
                            <>
                              {errors.identifier?.message ||
                                errors.root?.serverError.message ||
                                t("general.unknownError")}
                            </>
                          </Text>
                        ) : null}
                      </Group>
                    </>
                  )}

                  <Flex css={{ mb: "$3" }}>
                    {isWebauthnAvailable || mode === "sign_up" ? (
                      <Button size="2" type="submit">
                        <span>
                          {t("signInOrUp.signinWith", { provider: "Passkey" })}
                        </span>
                        {isWebauthnAvailable ? <FingerprintIcon /> : null}
                      </Button>
                    ) : (
                      <Button size="2" type="submit">
                        <span>{t("general.continueWithMagicLink")}</span>
                        <MagicMailIcon color="var(--scute-colors-buttonIconColor)" />
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

const RegisterForm = ({
  scuteClient,
  identifier,
  setAuthView,
  appData,
  mode,
  shouldSkipRegisterForm,
  backToLogin,
  setIsFatalError,
  getMagicLinkIdCallback,
  getAuthPayloadCallback,
}: RegisterFormProps) => {
  const {
    register,
    setError,
    clearErrors,
    handleSubmit,
    formState: { errors, isDirty, isValid },
  } = useForm();
  const isError = Object.keys(errors).length !== 0;

  const { t } = useTranslation();

  const {
    allowedIdentifiers,
    requiredIdentifiers,
    maybeNeededIdentifierType,
    maybeNeededIdentifierLabel,
  } = useSignInOrUpFormHelpers(identifier, appData, mode);

  useEffectOnce(() => {
    if (shouldSkipRegisterForm) {
      handleContinue({});
    }
  });

  const handleContinue: SubmitHandler<FieldValues> = async (values) => {
    let data: ScuteMagicLinkIdResponse | ScuteTokenPayload | null = null;
    let error: ScuteError | null = null;

    if (mode !== "confirm_invite") {
      ({ data, error } = await scuteClient.signUp(identifier, {
        userMeta: values,
      }));
    } else {
      const magicToken = new URL(window.location.href).searchParams.get(
        SCUTE_MAGIC_PARAM
      )!;
      const magicPayload = decodeMagicLinkToken(magicToken)!;

      ({ data, error } = await scuteClient.confirmInvite(magicToken, values));
      if (data) {
        const isWebauthnAvailable =
          scuteClient.isWebauthnSupported() &&
          magicPayload.webauthnEnabled !== false;

        if (isWebauthnAvailable) {
          setAuthView(VIEWS.WEBAUTHN_REGISTER);
        } else {
          // login
          const { error: signInError } =
            await scuteClient.signInWithTokenPayload(data);
          error = signInError;
        }

        getAuthPayloadCallback?.(data);
      }
    }

    const url = new URL(window.location.href);
    url.searchParams.delete(SCUTE_MAGIC_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());

    if (error) {
      const { isFatal } = getMeaningfulError(error);
      setIsFatalError?.(isFatal);
      setError("root.serverError", {
        type: String(error.code),
        message: translateError(error),
      });
      return;
    }

    if (data && "magic_link" in data) {
      const magicLinkId = data.magic_link.id;
      getMagicLinkIdCallback?.(magicLinkId);
    }
  };

  if (isError) {
    return (
      <>
        <Text
          size="2"
          css={{ color: "$errorColor", mb: "$1", textAlign: "center" }}
        >
          {errors.root?.serverError.message}
        </Text>
        <Flex css={{ jc: "center", mt: "2rem" }}>
          <Button
            variant="alt"
            size="2"
            onClick={() => {
              backToLogin();
            }}
          >
            {t("registerForm.backToLogin")}
          </Button>
        </Flex>
      </>
    );
  } else if (shouldSkipRegisterForm) {
    return <LargeSpinner spinnerColor="green" />;
  }

  return (
    <form
      onSubmit={handleSubmit(handleContinue)}
      onChange={() => {
        clearErrors("root.serverError");
      }}
    >
      <QueryContainer css={{ pt: "0px", pb: "$2" }}>
        <ResponsiveContainer>
          <ResponsiveLeft>
            <Inner
              css={{
                ta: "center",
                "@container queryContainer (min-width: 950px)": {
                  ta: "left",
                },
              }}
            >
              <Heading size="4" css={{ mb: "$2" }}>
                {t("general.signInOrUp")}
              </Heading>
              <Text size="2" css={{ mb: "$4" }}>
                {t("registerForm.needInfo")}
              </Text>
              {isError ? (
                <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
                  {t("general.correctErrors")}
                </Text>
              ) : null}
            </Inner>
          </ResponsiveLeft>
          <ResponsiveRight>
            <Inner>
              <div>
                {allowedIdentifiers.length > 1 ? (
                  <>
                    <Group>
                      <Label>{maybeNeededIdentifierLabel}</Label>
                      <TextField
                        placeholder={maybeNeededIdentifierLabel}
                        {...register(maybeNeededIdentifierType, {
                          required: requiredIdentifiers.includes(
                            maybeNeededIdentifierType
                          )
                            ? t("general.requiredField")
                            : undefined,
                        })}
                        size="2"
                      />
                    </Group>
                    {errors[maybeNeededIdentifierType] ? (
                      <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
                        <>{errors[maybeNeededIdentifierType]?.message}</>
                      </Text>
                    ) : null}
                  </>
                ) : // )
                null}
                {appData.user_meta_data_schema
                  .filter((metadata) => metadata.visible_registration)
                  .map(({ field_name, name, field_type, required }, i) => {
                    if (field_type === "phone") {
                      field_type = "tel" as any;
                    }

                    return (
                      <Group key={field_name} css={i === 0 ? { mt: "0" } : {}}>
                        {field_type === "boolean" ? (
                          <>
                            <Label>{name}</Label>
                            <br />
                            <input
                              type="checkbox"
                              {...register(field_name, {
                                required: required
                                  ? t("general.requiredField")
                                  : undefined,
                              })}
                            />
                          </>
                        ) : (
                          <FloatingLabelTextField
                            domId={`${name}__floating_label`}
                            label={name}
                            fieldType={field_type}
                            state={isError ? "invalid" : "valid"}
                            registerFormAttr={register(field_name, {
                              required: required
                                ? t("general.requiredField")
                                : undefined,
                              valueAsNumber:
                                field_type === "integer" ? true : undefined,
                            })}
                          />
                        )}
                        {errors[field_name] ? (
                          <Text
                            size="1"
                            css={{ color: "$errorColor", pt: "$2" }}
                          >
                            <>{errors[field_name]?.message}</>
                          </Text>
                        ) : null}
                      </Group>
                    );
                  })}
              </div>

              <br />
              <Button size="2" type="submit" disabled={!isDirty && !isValid}>
                <span>{t("general.continue")}</span>
              </Button>
            </Inner>
          </ResponsiveRight>
        </ResponsiveContainer>
      </QueryContainer>
    </form>
  );
};

const useSignInOrUpFormHelpers = (
  identifier: ScuteIdentifier,
  appData: ScuteAppData,
  mode: SignInOrUpProps["mode"]
) => {
  const { t } = useTranslation();

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
