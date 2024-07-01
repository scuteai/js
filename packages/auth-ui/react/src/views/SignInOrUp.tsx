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
import { FingerprintIcon, MagicMailIcon, BellIcon } from "../assets/icons";
import type { CommonViewProps } from "./common";
import {
  Button,
  Flex,
  Group,
  Header,
  Heading,
  Inner,
  Label,
  Text,
  TextField,
  Badge,
  IconHolder,
  Panel,
  LargeSpinner,
} from "../components";

import { SubmitHandler, useForm, type FieldValues } from "react-hook-form";
import { getIdentifierType } from "../helpers/identifierType";
// import PhoneInput from "../components/PhoneInput";
import { VIEWS } from "@scute/ui-shared";
import { AppLogo } from "../components/AppLogo";
import { translateError } from "../helpers/i18n/service";

interface SignInOrUpProps extends Omit<CommonViewProps, "identifier"> {
  identifier: ScuteIdentifier;
  setIdentifier: React.Dispatch<React.SetStateAction<ScuteIdentifier>>;
  mode?: "sign_in" | "sign_up" | "sign_in_or_up" | "confirm_invite";
  appData: ScuteAppData;
  webauthnEnabled?: boolean;
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
  } = props;

  const { t } = useTranslation();

  const providers = appData.oAuthProviders || [];

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
      <Header>
        <AppLogo url={appData.logo} alt={appData.name} size={2} />
      </Header>
      <Inner>
        {!showRegisterForm ? (
          <form
            onSubmit={handleSubmit(handleValidSubmit)}
            onChange={() => {
              clearErrors("root.serverError");
            }}
          >
            {mode !== "sign_up" && rememberedIdentifier ? (
              <>
                <Heading size="1" css={{ color: "$headingColor" }}>
                  {t("signInOrUp.welcomeBack")}
                </Heading>
                <Panel css={{ mt: "$4", mb: "$5" }}>
                  <Flex gap={2} css={{ ai: "center", jc: "space-between" }}>
                    <Flex>
                      <IconHolder>
                        <BellIcon />
                      </IconHolder>
                      <Flex css={{ fd: "column" }}>
                        <Text size="1" css={{ pl: "$2" }}>
                          {t("signInOrUp.signInAs")}
                        </Text>
                        <Badge
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "inline-block",
                            width: 180,
                            paddingTop: 6,
                          }}
                        >
                          {rememberedIdentifier}
                        </Badge>
                      </Flex>
                    </Flex>
                    <Button
                      variant="alt"
                      onClick={() => setRememberedIdentifier(null)}
                    >
                      {t("signInOrUp.changeUser")}
                    </Button>
                  </Flex>
                </Panel>
              </>
            ) : (
              <>
                <Heading
                  css={{
                    color: "$headingColor",
                    fontSize: "large",
                    textAlign: "center",
                  }}
                >
                  {signInOrUpText}
                </Heading>

                <Group>
                  <Label>{identifierLabelText}</Label>
                  <TextField
                    placeholder={identifierLabelText}
                    autoCorrect="off"
                    autoCapitalize="none"
                    {...register("identifier", {
                      required: t("signInOrUp.identifierRequired"),
                      validate: {
                        maxLength: (v) => {
                          let isValidOrError: boolean | string = true;

                          if (allowedIdentifiers.includes("email")) {
                            isValidOrError =
                              v.length <= 50 || t("signInOrUp.emailLimit");
                          }

                          if (allowedIdentifiers.includes("phone")) {
                            const isValidPhoneOrError: boolean | string = true;
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
                            const isValidPhoneOrError: boolean | string = true;
                            isValidOrError =
                              isValidPhoneOrError || isValidOrError;
                          }

                          return isValidOrError;
                        },
                      },
                    })}
                    size="2"
                    autoComplete={`webauthn ${
                      isEmailIdentifierAllowed ? "email" : ""
                    }${isPhoneIdentifierAllowed ? "tel" : ""}`}
                    state={isError ? "invalid" : "valid"}
                  />
                  {isError ? (
                    <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
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

            <Flex>
              {isWebauthnAvailable || mode === "sign_up" ? (
                <Button
                  size="2"
                  type="submit"
                  disabled={!rememberedIdentifier && !isDirty && !isValid}
                >
                  <span>{t("general.continue")}</span>
                  {isWebauthnAvailable ? (
                    <FingerprintIcon color="var(--scute-colors-buttonIconColor)" />
                  ) : null}
                </Button>
              ) : (
                <Button size="2" type="submit">
                  <span>{t("general.continueWithMagicLink")}</span>
                  <MagicMailIcon color="var(--scute-colors-buttonIconColor)" />
                </Button>
              )}
            </Flex>
          </form>
        ) : (
          <RegisterForm {...registerFormProps} />
        )}
        <Flex
          direction={providers.length < 4 ? "column" : "row"}
          wrap="wrap"
          justify="center"
          style={{ paddingTop: 16 }}
        >
          {providers.map((provider) => (
            <Button
              key={provider.provider}
              size="2"
              variant="alt"
              style={
                providers.length < 4
                  ? { marginBottom: 16 }
                  : {
                      marginBottom: 16,
                      width: "auto",
                      padding: 16,
                      marginRight: 12,
                    }
              }
              onClick={() => {
                scuteClient.signInWithOAuthProvider(provider.provider);
              }}
            >
              {providers.length < 4 && (
                <span>
                  {t("signInOrUp.signinWith", { provider: provider.name })}
                </span>
              )}
              <IconHolder
                style={
                  providers.length < 4
                    ? { position: "absolute", left: 16, top: 13 }
                    : { position: "relative", top: 5 }
                }
              >
                <img
                  src={provider.icon}
                  alt={provider.name}
                  width="24"
                  height="24"
                />
              </IconHolder>
            </Button>
          ))}
        </Flex>
      </Inner>
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
      <div>
        <span>{t("registerForm.needInfo")}:</span>
        {isError ? (
          <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
            {t("general.correctErrors")}
          </Text>
        ) : null}
      </div>
      <br />
      <div>
        {allowedIdentifiers.length > 1 ? (
          <>
            {/* // TODO
          // maybeNeededIdentifierType === "phone" ? (
          //   <PhoneInput
          //     // {...register(maybeNeededIdentifierType, {
          //     //   required: requiredIdentifiers.includes(
          //     //     maybeNeededIdentifierType
          //     //   ),
          //     // })}
          //   />
          // ) : ( */}
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
          .map(({ field_name, name, field_type, required }) => {
            if (field_type === "phone") {
              field_type = "tel" as any;
            }

            return (
              <Group key={field_name}>
                <Label>{name}</Label>
                {field_type === "boolean" ? (
                  <>
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
                  <TextField
                    placeholder={name}
                    type={field_type}
                    {...register(field_name, {
                      required: required
                        ? t("general.requiredField")
                        : undefined,
                      valueAsNumber:
                        field_type === "integer" ? true : undefined,
                    })}
                    size="2"
                  />
                )}
                {errors[field_name] ? (
                  <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
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

  let identifierLabelText = t("general.email");
  if (isEmailIdentifierAllowed && isPhoneIdentifierAllowed) {
    identifierLabelText = t("general.emailOrPhone");
  } else if (isPhoneIdentifierAllowed) {
    identifierLabelText = t("general.phone");
  }

  const maybeNeededIdentifierType: ScuteIdentifierType =
    identifierType === "email" ? "phone" : "email";
  const maybeNeededIdentifierLabel =
    maybeNeededIdentifierType === "email"
      ? t("general.email")
      : t("general.phone");

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
