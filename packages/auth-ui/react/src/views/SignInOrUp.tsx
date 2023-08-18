import {
  type ScuteClient,
  type ScuteIdentifier,
  type ScuteAppData,
  type ScuteUserMetaDataSchema,
  type UniqueIdentifier,
  getMeaningfulError,
  ScuteIdentifierType,
  IdentifierAlreadyExistsError,
  IdentifierNotRecognizedError,
} from "@scute/core";

import debounce from "lodash.debounce";
import { useEffect, useState } from "react";
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
} from "../components";

import { SubmitHandler, useForm, type FieldValues } from "react-hook-form";
import { getIdentifierType } from "../helpers/identifierType";
import PhoneInput from "../components/PhoneInput";
import { VIEWS } from "@scute/ui-shared";

interface SignInOrUpProps extends Omit<CommonViewProps, "identifier"> {
  identifier: ScuteIdentifier;
  setIdentifier: React.Dispatch<React.SetStateAction<ScuteIdentifier>>;
  mode?: "sign_in" | "sign_up" | "sign_in_or_up";
  appData: ScuteAppData;
  webauthnEnabled?: boolean;
  getMagicLinkIdCallback?: (magicLinkId: UniqueIdentifier) => void;
}

const SignInOrUp = (props: SignInOrUpProps) => {
  const {
    scuteClient,
    identifier,
    setIdentifier,
    setAuthView,
    appData,
    mode = "sign_in_or_up",
    webauthnEnabled = true,
    setIsFatalError,
    getMagicLinkIdCallback,
  } = props;

  const registerFormProps: SignInOrUpProps = { ...props };

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors, isValid },
  } = useForm();
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const {
    signInOrUpText,
    identifierLabelText,
    isEmailIdentifierAllowed,
    isPhoneIdentifierAllowed,
  } = useSignInOrUpFormHelpers(identifier, appData, mode);

  const [rememberedIdentifier, setRememberedIdentifier] =
    useRememberedIdentifier(scuteClient);

  const isWebauthnAvailable =
    webauthnEnabled && scuteClient.isWebauthnSupported();

  const handleValidSubmit = async () => {
    const _identifier = (
      identifier ? identifier : rememberedIdentifier
    ) as string;

    setIdentifier(_identifier);
    const user = await scuteClient.identifierExists(_identifier);

    if (!user && mode === "sign_in") {
      setError(new IdentifierNotRecognizedError().message);
      return;
    } else if (user && mode === "sign_up") {
      setError(new IdentifierAlreadyExistsError().message);
      return;
    }

    if (user) {
      // login
      if (webauthnEnabled && user.webauthn_enabled) {
        setAuthView(VIEWS.WEBAUTHN_VERIFY);
      } else {
        const { data, error: magicLinkError } =
          await scuteClient.sendLoginMagicLink(_identifier);

        if (magicLinkError) {
          const { isFatal, message: errorMsg } =
            getMeaningfulError(magicLinkError);
          setIsFatalError?.(isFatal);
          setError(errorMsg);
          return;
        }

        getMagicLinkIdCallback?.(data.magic_link.id);
      }
    } else {
      // register
      setShowRegisterForm(true);
    }
  };

  return (
    <>
      <Header>
        <Flex>
          {/* TODO: dark mode logo? */}
          <img height="150" width="150" src={appData.logo}/>
        </Flex>
      </Header>
      <Inner>
        {!showRegisterForm ? (
          <form onSubmit={handleSubmit(handleValidSubmit)}>
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
                    })}
                    size="2"
                    autoComplete={`webauthn ${
                      isEmailIdentifierAllowed ? "email" : ""
                    }${isPhoneIdentifierAllowed ? "tel" : ""}`}
                    state={error ? "invalid" : "valid"}
                    onChange={(e) => {
                      const identifier = e.target.value;
                      setIdentifier(identifier);

                      debounce(async () => {
                        await trigger("identifier");
                      }, 500)();
                    }}
                  />
                  {error ||
                    (!isValid && errors.identifier ? (
                      <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
                        <>{error || errors.identifier.message}</>
                      </Text>
                    ) : null)}
                </Group>
              </>
            )}

            <Flex>
              {isWebauthnAvailable || mode === "sign_up" ? (
                <Button
                  size="2"
                  type="submit"
                  disabled={!!error || (!rememberedIdentifier && !isValid)}
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

const RegisterForm = ({
  scuteClient,
  identifier,
  appData,
  mode,
  setIsFatalError,
  getMagicLinkIdCallback,
}: SignInOrUpProps) => {
  const { register, handleSubmit, trigger, formState, reset } = useForm();
  const { errors, isValid } = formState;

  const [error, setError] = useState<string | null>(null);

  const {
    allowedIdentifiers,
    requiredIdentifiers,
    maybeNeededIdentifierType,
    maybeNeededIdentifierLabel,
  } = useSignInOrUpFormHelpers(identifier, appData, mode);

  const handleSignUp: SubmitHandler<FieldValues> = async (values) => {
    const { data: pollingData, error: signUpError } = await scuteClient.signUp(
      identifier,
      {
        userMeta: values,
      }
    );

    if (signUpError) {
      const { isFatal, message: errorMsg } = getMeaningfulError(signUpError);
      setIsFatalError?.(isFatal);
      setError(errorMsg);
      return;
    }

    if (pollingData) {
      const magicLinkId = pollingData.magic_link.id;
      getMagicLinkIdCallback?.(magicLinkId);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleSignUp)}>
      <div>
        <span>Let's get you set up. We'll need following information:</span>
        {error ||
          (errors && (
            <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
              {error
                ? error
                : Object.keys(errors).length !== 0
                ? "Please correct all highlighted errors."
                : null}
            </Text>
          ))}
      </div>
      <br />
      <div>
        {(
          [
            {
              name: "First Name",
              field_name: "first_name",
              type: "string",
            },
            {
              name: "Last Name",
              field_name: "last_name",
              type: "string",
            },
          ] as ScuteUserMetaDataSchema[]
        ).map(({ name, field_name, type }) => (
          <Group key={field_name}>
            <Label>{name}</Label>
            <TextField
              placeholder={name}
              {...register(field_name, {
                required: "This field is required.",
              })}
              size="2"
              onChange={debounce(async () => {
                await trigger(field_name);
              }, 500)}
            />

            {errors[field_name] ? (
              <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
                <>{errors[field_name]?.message}</>
              </Text>
            ) : null}
          </Group>
        ))}

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
                onChange={() =>
                  debounce(async () => {
                    await trigger(maybeNeededIdentifierType);
                  }, 500)
                }
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
        {appData.user_meta_data_schema.map(({ field_name, name, type }) => (
          <Group key={field_name}>
            <Label>{name}</Label>
            <TextField
              placeholder={name}
              type={type}
              {...register(field_name, {
                required: "This field is required.",
                valueAsNumber: type === "number" ? true : undefined,
              })}
              size="2"
              onChange={debounce(async () => {
                await trigger(field_name);
              }, 500)}
            />
            {errors[field_name] ? (
              <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
                <>{errors[field_name]?.message}</>
              </Text>
            ) : null}
          </Group>
        ))}
      </div>
      <br />
      <Button size="2" type="submit" disabled={!!error || !isValid}>
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

  let signInOrUpText = "Sign Up or Log in";
  if (!isPublicSignUpAllowed || mode === "sign_in") {
    signInOrUpText = "Log in";
  } else if (mode === "sign_up") {
    signInOrUpText = "Sign Up";
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
