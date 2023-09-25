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
} from "@scute/core";

import { useEffect, useState } from "react";
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
        message: error.message,
      });

      return;
    } else if (user && mode === "sign_up") {
      const error = new IdentifierAlreadyExistsError();
      setError("root.serverError", {
        type: String(error.code),
        message: error.message,
      });
      return;
    }

    if (user) {
      // login
      if (webauthnEnabled && user.webauthn_enabled) {
        setAuthView(VIEWS.WEBAUTHN_VERIFY);
      } else {
        const { data, error: magicLinkError } =
          await scuteClient.sendLoginMagicLink(identifier);

        if (magicLinkError) {
          const { isFatal, message: errorMsg } =
            getMeaningfulError(magicLinkError);
          setIsFatalError?.(isFatal);
          setError("root.serverError", {
            type: String(magicLinkError.code),
            message: errorMsg,
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
          const { isFatal, message: errorMsg } =
            getMeaningfulError(signUpError);
          setIsFatalError?.(isFatal);
          setError("root.serverError", {
            type: String(signUpError.code),
            message: errorMsg,
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
                  Welcome back!
                </Heading>
                <Panel css={{ mt: "$4", mb: "$5" }}>
                  <Flex gap={2} css={{ ai: "center", jc: "space-between" }}>
                    <Flex>
                      <IconHolder>
                        <BellIcon />
                      </IconHolder>
                      <Flex css={{ fd: "column" }}>
                        <Text size="1" css={{ pl: "$2" }}>
                          Sign in as
                        </Text>
                        <Badge>{rememberedIdentifier}</Badge>
                      </Flex>
                    </Flex>
                    <Button
                      variant="alt"
                      onClick={() => setRememberedIdentifier(null)}
                    >
                      Change user
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
                    {...register("identifier", {
                      required: "Identifier is required.",
                      validate: {
                        maxLength: (v) => {
                          let isValidOrError: boolean | string = true;

                          if (allowedIdentifiers.includes("email")) {
                            isValidOrError =
                              v.length <= 50 ||
                              "The email should have at most 50 characters";
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
                              /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(
                                v
                              ) || "Email address must be a valid address";
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
                          "Unknown error"}
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
                  <span>Continue</span>
                  {isWebauthnAvailable ? (
                    <FingerprintIcon color="var(--scute-colors-buttonIconColor)" />
                  ) : null}
                </Button>
              ) : (
                <Button size="2" type="submit">
                  <span>Continue with magic link</span>
                  <MagicMailIcon color="var(--scute-colors-buttonIconColor)" />
                </Button>
              )}
            </Flex>
          </form>
        ) : (
          <RegisterForm {...registerFormProps} />
        )}
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
      const { isFatal, message: errorMsg } = getMeaningfulError(error);
      setIsFatalError?.(isFatal);
      setError("root.serverError", {
        type: String(error.code),
        message: errorMsg,
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
            Back to login
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
        <span>Let's get you set up. We'll need following information:</span>
        {isError ? (
          <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
            Please correct all highlighted errors.
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
                    ? "This field is required."
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
                          ? "This field is required."
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
                        ? "This field is required."
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
        <span>Continue</span>
      </Button>
    </form>
  );
};

const useSignInOrUpFormHelpers = (
  identifier: ScuteIdentifier,
  appData: ScuteAppData,
  mode: SignInOrUpProps["mode"]
) => {
  const allowedIdentifiers = appData.allowed_identifiers;
  const requiredIdentifiers = appData.required_identifiers;
  const isPublicSignUpAllowed = appData.public_signup !== false;
  const identifierType = getIdentifierType(identifier);

  let signInOrUpText = "Sign up or Log in";
  if (!isPublicSignUpAllowed || mode === "sign_in") {
    signInOrUpText = "Log in";
  } else if (mode === "sign_up") {
    signInOrUpText = "Sign up";
  }

  const isEmailIdentifierAllowed = allowedIdentifiers.includes("email");
  const isPhoneIdentifierAllowed = allowedIdentifiers.includes("phone");

  let identifierLabelText = "Email";
  if (isEmailIdentifierAllowed && isPhoneIdentifierAllowed) {
    identifierLabelText = "Email or Phone number";
  } else if (isPhoneIdentifierAllowed) {
    identifierLabelText = "Phone number";
  }

  const maybeNeededIdentifierType: ScuteIdentifierType =
    identifierType === "email" ? "phone" : "email";
  const maybeNeededIdentifierLabel =
    maybeNeededIdentifierType === "email" ? "Email" : "Phone number";

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
