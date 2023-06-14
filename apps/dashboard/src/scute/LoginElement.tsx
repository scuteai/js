import React, { useState, useMemo, useEffect, useContext } from "react";
import {
  Logo,
  FingerprintIcon,
  MagicMailIcon,
  BiometricsIcon,
  BellIcon,
  TextField,
  Flex,
  Heading,
  Text,
  Badge,
  Button,
  Label,
  LargeSpinner,
  Panel,
  FooterCredits,
  Layout,
  ElementCard,
  Header,
  Inner,
  IconHolder,
  Group,
  Content,
} from "@scute/auth-ui-react";

import { isValidEmail, emailRegx } from "./utils/is-valid-email";
import {
  ScuteClient,
  platformAuthenticatorIsAvailable,
  preformatGetAssertReq,
  preformatMakeCredReq,
  publicKeyCredentialToJSON,
} from "@scute/auth-react";

import useInterval from "./hooks/useInterval";
//@ts-ignore
import Cookies from "js-cookie";
import { ScuteAuthContext } from "./ScuteAuthContext";

interface RememberedUser {
  email: string;
  name: string;
  uid: string;
}
export interface FormState {
  currentState:
    | "idle"
    | "bio_verification"
    | "bio_magic_token"
    | "email_pending"
    | "bio_error"
    | "remembered"
    | "loading";
  email: string;
  remember?: RememberedUser;
  error: string;
}

export const LoginElement = (props: any) => {
  //@ts-ignore
  const { loginWithToken, authState, config } = useContext(ScuteAuthContext);
  const { appId, user } = authState; // TODO: Throw error if no App Id

  const initialState: FormState = {
    currentState: props.currentState || "idle",
    email: props.email || "",
    error: "",
  };

  const scute = new ScuteClient({ appId: appId, baseUrl: config.baseUrl });

  const [state, setState] = useState<FormState>(initialState);

  const [webauthnSupport, setWebauthnSupport] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [magicLink, setMagicLink] = useState<string>("");
  const [magicLinkId, setMagicLinkId] = useState<string | null>(null);

  useEffect(() => {
    checkWebauthnSupport();
    const userCookie = Cookies.get("scu_user");
    if (userCookie) {
      const rUser: RememberedUser = JSON.parse(userCookie);
      console.log("UUUU: ", rUser);
      setState({
        ...state,
        email: rUser.email,
        remember: rUser,
      });
    }
  }, []);

  useInterval(
    () => {
      checkMLStatus();
    },
    isPolling ? 5000 : null
  );

  useEffect(() => {
    let urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("sct_magic")) {
      setMagicLink(urlParams.get("sct_magic") || "");
    }
  }, []);

  useEffect(() => {
    if (magicLink != "") {
      loginWithMagicToken(magicLink);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magicLink]);

  useEffect(() => {
    console.log("Changeee:", state);
    if (state.remember && state.email === "") {
      setState({
        ...state,
        email: state.remember.email,
      });
    }
  }, [state]);

  const checkWebauthnSupport = async () => {
    let webauthnSupported = await platformAuthenticatorIsAvailable();
    setWebauthnSupport(webauthnSupported);
  };

  const resetState = () => {
    setState({
      currentState: "idle",
      email: "",
      error: "",
    });
  };

  const setCurrentState = (view: FormState["currentState"]) => {
    setState({
      ...state,
      currentState: view,
    });
  };

  const switchToEmailLogin = () => {
    setCurrentState("idle");
    setWebauthnSupport(false);
  };

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setState({
      ...state,
      email: event.target.value,
      error:
        event.target.value === "" || isValidEmail(state.email)
          ? ""
          : state.error,
    });
  };

  const handleSubmit = async () => {
    if (!state.email) {
      setState({ ...state, error: "Email is required" });
      return false;
    }
    if (!emailRegx.test(state.email)) {
      setState({ ...state, error: "Email does not look right" });
      return false;
    }

    // webauthnSupport ? loginWithWebauthn() : sendEmailWithLink(false)
    loginWithWebauthn();
  };

  const loginWithWebauthn = async () => {
    await scute.login(state.email).then((response) => {
      console.log("RES: ", response);
      let action = response.action;
      if (action === "register") {
        createCredentials(response.options);
      } else if (action === "login") {
        credentialsAssertion(response.options);
      } else {
        // New device
        sendEmailWithLink(true);
        console.log("new device");
      }
    });
  };

  // url with magic token (sets the view to biometrics if webauthn supported, if not logs in
  const loginWithMagicToken = async (token: string) => {
    let webauthnSupported = await platformAuthenticatorIsAvailable();
    console.log("webauthn support:", webauthnSupported);
    console.log(token);
    if (token !== "") {
      if (webauthnSupported) {
        registerDeviceAfterMagicToken(token, webauthnSupported);
      } else {
        setCurrentState("loading");
        await scute.authMagic(token, webauthnSupported).then((response) => {
          console.log("RES: ", response);
          completeLogin(response);
        });
      }
    } else {
      alert("where is the magic token broh");
    }
  };

  const registerDeviceAfterMagicToken = async (
    token: string,
    webauthnSupported: boolean
  ) => {
    setCurrentState("bio_magic_token");
    await scute.authMagic(token, webauthnSupported).then((response) => {
      console.log("RES: ", response);
      let action = response.action;
      if (action === "register") {
        createCredentials(response.options);
      } else if (action === "login") {
        credentialsAssertion(response.options);
      } else {
        // Magic Link (this could be infinite loop, throw an error maybe ?)
        // TODO : Remove maybe
        alert("muzaffer ol ");
      }
    });
  };

  const sendEmailWithLink = async (hasWebauthn: boolean) => {
    setCurrentState('email_pending')
    setIsPolling(false)
    scute.sendMagicLink(state.email, hasWebauthn)
    .then(response => {
      console.log("MAGIC: ", response)
      setMagicLinkId(response.id)
      setIsPolling(true)
    }).catch(error => {
      setCurrentState('bio_error')
      setIsPolling(false)
    })
  };

  // listens to magic link status on interval, and logs in if success (a.k.a. xlogin)
  const checkMLStatus = () => {
    if (magicLinkId) {
      scute
        .magicLinkStatus(magicLinkId)
        .then((response) => {
          console.log(response);
          if (response.status === 200) {
            completeLogin(response.data);
          } else {
            console.log(response.data);
          }
        })
        .catch((error) => {
          console.log("error");
        });
    }
  };

  const createCredentials = async (response: any) => {
    const publicKey = preformatMakeCredReq(response);
    let makeCredResponse;
    try {
      let cred = await navigator.credentials.create({ publicKey });
      makeCredResponse = publicKeyCredentialToJSON(cred);
      makeCredResponse.email = state.email;

      scute
        .webauthnCredentialsCreate(makeCredResponse)
        .then((response) => {
          console.log("Create CRED: ", response);
          completeLogin(response);
        })
        .catch((err) => {
          console.log(err);
        });
    } catch (error) {
      console.log("Error: ", error);
      console.log("NO webauthn");
      sendEmailWithLink(false);
    }
  };

  const credentialsAssertion = async (response: any) => {
    const publicKey = preformatGetAssertReq(response);
    let assetionResponse;
    try {
      let cred = await navigator.credentials.get({ publicKey });
      assetionResponse = publicKeyCredentialToJSON(cred);
      assetionResponse.email = state.email;

      scute
        .webauthnCredentialsAssertion(assetionResponse)
        .then((response) => {
          completeLogin(response);
        })
        .catch((err) => {
          console.log(err);
        });
    } catch (error) {
      console.log("Error: ", error);
      console.log("NO webauthn");
      // TODO?
      //sendEmailWithLink(false);
    }
  };

  const completeLogin = (response: any) => {
    console.log("loginsuccess:", response);
    setIsPolling(false);
    console.log("calling it");
    loginWithToken(response.cbt);

    // Set cookies with next helper
  };

  /// Views

  const StateView = () => {
    switch (state.currentState) {
      case "idle":
        return (
          <StateIdle
            webauthnSupport={webauthnSupport}
            handleEmailChange={handleEmailChange}
            handleSubmit={handleSubmit}
            email={state.email}
            error={state.error}
            remember={state.remember}
            resetHandler={() => resetState()}
          />
        );
      case "bio_verification":
        return <StateBioVerification />;
      case "email_pending":
        return <StateEmailPending />;
      case "loading":
        return <StateEmailLoading />;
      case "bio_error":
        return <StateBioError />;
      case "bio_magic_token":
        return <StateBioWithMagicToken />;
      default:
        return null;
    }
  };

  const StateBioVerification = () => (
    <>
      <Header>
        <BiometricsIcon color="var(--scute-colors-contrast8)" />
      </Header>
      <Inner
        css={{
          display: "flex",
          jc: "center",
          fd: "column",
          textAlign: "center",
        }}
      >
        <Heading size="1" css={{ color: "$headingColor" }}>
          Verify your identity
        </Heading>
        <Text css={{ color: "$textColor" }}>
          Log into your account with the method you already use to unlock your
          device
        </Text>
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{state.email}</Badge>
        </Flex>
        <Flex css={{ jc: "space-between" }}>
          <Button variant="alt" onClick={() => setCurrentState("idle")}>
            Change email
          </Button>
          <Button variant="alt" onClick={() => switchToEmailLogin()}>
            Login with the email link
          </Button>
        </Flex>
      </Inner>
    </>
  );

  const StateBioWithMagicToken = () => (
    <>
      <Header>
        <BiometricsIcon color="var(--scute-colors-contrast8)" />
      </Header>
      <Inner
        css={{
          display: "flex",
          jc: "center",
          fd: "column",
          textAlign: "center",
        }}
      >
        <Heading size="1" css={{ color: "$headingColor" }}>
          Let&#39;s register your device
        </Heading>
        <Text css={{ color: "$textColor" }}>
          Log into your account with the method you already use to unlock your
          device
        </Text>
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{state.email}</Badge>
        </Flex>
        <Flex css={{ jc: "space-between" }}>
          <Button variant="alt" onClick={() => setCurrentState("idle")}>
            Change email
          </Button>
          <Button variant="alt" onClick={() => switchToEmailLogin()}>
            Login with the email link
          </Button>
        </Flex>
      </Inner>
    </>
  );

  const StateBioError = () => (
    <>
      <Header>
        <BiometricsIcon color="var(--scute-colors-errorColor)" />
      </Header>
      <Inner
        css={{
          display: "flex",
          jc: "center",
          fd: "column",
          textAlign: "center",
        }}
      >
        <Heading size="1" css={{ color: "$errorColor" }}>
          Something went wrong
        </Heading>
        <Text size="2" css={{ color: "$errorColor", mb: "$1" }}>
          Please try again
        </Text>
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{state.email}</Badge>
        </Flex>
        <Flex css={{ jc: "center" }}>
          <Button
            variant="alt"
            size="2"
            onClick={() => setCurrentState("idle")}
          >
            Try again
          </Button>
        </Flex>
      </Inner>
    </>
  );

  const StateEmailPending = () => (
    <>
      <Header css={{ mb: "$1" }}>
        <LargeSpinner
          iconColor="var(--scute-colors-contrast8)"
          spinnerColor="var(--scute-colors-focusColor)"
        />
      </Header>
      <Inner
        css={{
          display: "flex",
          jc: "center",
          fd: "column",
          textAlign: "center",
        }}
      >
        <Heading size="1" css={{ color: "$headingColor" }}>
          Check your email to login
        </Heading>
        <Text size="2" css={{ color: "$textColor", mb: "$1" }}>
          {`We’ve sent an email to your inbox with`} <br />a one-time link.
        </Text>
        <Text size="2">
          You will be automatically signed in here once you click that link.
        </Text>
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{state.email}</Badge>
        </Flex>
        <Flex css={{ jc: "space-between" }}>
          <Button variant="alt" onClick={() => setCurrentState("idle")}>
            Change email
          </Button>
          <Button variant="alt" disabled>
            Resend email
          </Button>
        </Flex>
      </Inner>
    </>
  );

  const StateEmailLoading = () => (
    <>
      <Header css={{ mb: "$1" }}>
        <LargeSpinner
          iconColor="var(--scute-colors-contrast8)"
          spinnerColor="green"
        />
      </Header>
      <Inner
        css={{
          display: "flex",
          jc: "center",
          fd: "column",
          textAlign: "center",
        }}
      >
        <Heading size="1" css={{ color: "$headingColor" }}>
          We are logging you in
        </Heading>
        <Text size="2" css={{ color: "$textColor", mb: "$1" }}></Text>
        <Flex css={{ jc: "center", py: "$5" }}>
          <Badge size="1">{state.email}</Badge>
        </Flex>
      </Inner>
    </>
  );

  return (
    <Layout>
      <ElementCard>
        <Content>
          <StateView />
        </Content>
        <Flex css={{ jc: "center", pb: "$1" }}>
          <FooterCredits>
            <span>powered by</span>{" "}
            <span>
              <Logo webauthnSupport={webauthnSupport} /> scute
            </span>
          </FooterCredits>
        </Flex>
      </ElementCard>
    </Layout>
  );
};

const TempAvatar = () => (
  <svg
    width="56"
    height="56"
    viewBox="0 0 56 56"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="28" cy="28" r="28" fill="#EEEEEE" />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M43.8412 12.1491C43.8401 12.1484 43.8394 12.1473 43.8383 12.1466C43.8347 12.1433 43.8314 12.1404 43.8278 12.1375C43.8179 12.1284 43.8078 12.1197 43.7972 12.1113C43.6061 11.9612 43.3364 11.963 43.1478 12.116C33.1264 18.8708 23.1701 19.5071 12.8575 12.1222H12.8571C12.6834 11.9761 12.4352 11.9594 12.2437 12.0808C12.2422 12.0819 12.2408 12.083 12.2393 12.0841C12.2266 12.0921 12.2139 12.1008 12.2019 12.1102C12.199 12.1128 12.1957 12.1153 12.1928 12.1179C12.1833 12.1255 12.1743 12.1335 12.1655 12.1415C12.1597 12.1469 12.1539 12.1527 12.1485 12.1586C12.1426 12.1644 12.1368 12.1706 12.131 12.1771C12.123 12.1862 12.1154 12.1953 12.1081 12.2051C12.1056 12.2084 12.1034 12.2116 12.1008 12.2145C12.0914 12.228 12.0823 12.2414 12.074 12.2556C11.9595 12.4475 11.9802 12.6906 12.1248 12.8607C19.5049 23.1712 18.8697 33.1254 12.1197 43.1446H12.1201C11.9606 43.3372 11.9598 43.6156 12.1187 43.8086C12.1197 43.8104 12.1208 43.8119 12.1219 43.8137H12.1227C12.1296 43.821 12.1365 43.8282 12.1437 43.8351C12.1495 43.8413 12.1554 43.8471 12.1615 43.853C12.1641 43.8555 12.1666 43.858 12.1692 43.8606C12.3592 44.0372 12.65 44.047 12.8513 43.8842C22.8764 37.1332 32.8281 36.4932 43.1416 43.8769C43.3153 44.0234 43.5643 44.0405 43.7565 43.9191C43.758 43.9173 43.7594 43.9155 43.7609 43.9137C43.7736 43.9057 43.786 43.8969 43.7979 43.8878C43.8009 43.8853 43.8041 43.8828 43.807 43.8799C43.8165 43.8726 43.8256 43.8646 43.8343 43.8566C43.8401 43.8508 43.8459 43.8453 43.8514 43.8391C43.8572 43.8333 43.8634 43.8272 43.8688 43.821C43.8768 43.8119 43.8844 43.8024 43.8917 43.793C43.8942 43.7897 43.8968 43.7865 43.899 43.7832C43.9088 43.7701 43.9175 43.7563 43.9259 43.7425C44.0403 43.5509 44.02 43.3082 43.8757 43.1381C36.4949 32.8267 37.1334 22.8772 43.8801 12.8532C44.0396 12.6606 44.04 12.3822 43.8812 12.1896C43.8801 12.1882 43.8793 12.1871 43.8783 12.1856C43.8779 12.1856 43.8779 12.1853 43.8775 12.1849C43.871 12.1773 43.8641 12.17 43.8572 12.1627C43.8525 12.1576 43.8477 12.1522 43.843 12.1471L43.8412 12.1491Z"
      fill="#2F2F2F"
    />
  </svg>
);

const RememberedUserPanel = (
  remembered?: RememberedUser,
  resetHandler?: any
) => {
  let user: RememberedUser | null = null;
  const userCookie = Cookies.get("scu_user");
  if (userCookie) {
    user = JSON.parse(userCookie);
  }
  return (
    <>
      <Heading size="1" css={{ color: "$headingColor" }}>
        Welcome back, {user !== null ? user.name : ""}
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
              <Badge>{user !== null && user.email}</Badge>
            </Flex>
          </Flex>
          {/* <Button variant="alt" onClick={() => resetHandler?.()}>Change user</Button> */}
        </Flex>
      </Panel>
    </>
  );
};

const StateIdle = ({
  email,
  handleEmailChange,
  error,
  webauthnSupport,
  remember,
  handleSubmit,
  resetHandler,
}: any) => {
  return (
    <>
      <Header>
        <Flex>
          <TempAvatar />
        </Flex>
      </Header>
      <Inner>
        {remember ? (
          //@ts-ignore
          <RememberedUserPanel remembered={remember} />
        ) : (
          <>
            <Heading size="1" css={{ color: "$headingColor" }}>
              Welcome
            </Heading>
            <Text css={{ color: "$textColor" }}>
              Sign in to your account using your email
            </Text>
            <Group>
              <Label>Email address</Label>
              <TextField
                key="scute-email"
                name="email"
                type="text"
                size="2"
                autoFocus={true}
                required
                placeholder="example@email.com"
                value={email}
                onChange={handleEmailChange}
                state={error ? "invalid" : "valid"}
              />
              {error && (
                <Text size="1" css={{ color: "$errorColor", pt: "$2" }}>
                  Email does not look right
                </Text>
              )}
            </Group>
          </>
        )}
        <Flex>
          {webauthnSupport ? (
            <Button size="2" onClick={handleSubmit} disabled={error != ""}>
              <span>Continue</span>
              <FingerprintIcon color="var(--scute-colors-buttonIconColor)" />
            </Button>
          ) : (
            <Button size="2" onClick={handleSubmit}>
              <span>Continue with magic link</span>
              <MagicMailIcon color="var(--scute-colors-buttonIconColor)" />
            </Button>
          )}
        </Flex>
        {remember ? <Flex css={{ pt: "$3", jc: "center" }}></Flex> : ""}
      </Inner>
    </>
  );
};
