import { FingerprintIcon, MagicMailIcon } from "../assets/icons";
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
} from "../components";
import RememberedUserPanel from "./RememberedUserPanel";

const Login = ({
  email,
  handleEmailChange,
  handleLogin,
  error,
  maybeWebauthn,
  remember,
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
                  {error}
                </Text>
              )}
            </Group>
          </>
        )}
        <Flex>
          {maybeWebauthn ? (
            <Button size="2" onClick={() => handleLogin()} disabled={!!error}>
              <span>Continue</span>
              <FingerprintIcon color="var(--scute-colors-buttonIconColor)" />
            </Button>
          ) : (
            <Button size="2" onClick={() => handleLogin()}>
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

export default Login;

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
