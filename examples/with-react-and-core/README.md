# Scute JS Core React Integration Guide

## Installation

First, install the required packages. The `@scute/js-core` package provides the core authentication client for JavaScript applications.

```bash
npm install @scute/js-core react react-dom
```

For development, you'll also need TypeScript and Vite for the best development experience:

```bash
npm install -D typescript @types/react @types/react-dom @vitejs/plugin-react vite
```

## Setup

### 1. Initialize Scute Client

Create a client instance in `scute.ts`. This client will handle all authentication operations and API calls to your Scute backend. The configuration requires your app ID and base URL, which should be stored as environment variables for security.

```typescript
import { createClient } from "@scute/js-core";

export const scuteClient = createClient({
  appId: import.meta.env.VITE_SCUTE_APP_ID,
  baseUrl: import.meta.env.VITE_SCUTE_BASE_URL,
});
```

### 2. Project Structure

Your React app structure should look like this:

```
src/
├── App.tsx          # Main app component with auth flow
├── App.css          # Styling for the app
├── main.tsx         # React app entry point
├── scute.ts         # Scute client configuration
└── index.css        # Global styles
```

### 3. Main App Entry Point

In your `main.tsx`, initialize the React app:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

## Complete Authentication Flow Implementation

### State Management and Types

Set up the necessary state variables and import types to manage the authentication flow. The component manages different authentication states and handles various authentication methods including passkeys, magic links, OTP, and OAuth.

```typescript
import {
  getMeaningfulError,
  SCUTE_MAGIC_PARAM,
  SCUTE_SKIP_PARAM,
  ScuteClient,
  type ScuteTokenPayload,
  type ScuteUserData,
} from "@scute/js-core";
import { useEffect, useRef, useState } from "react";
import { scuteClient } from "./scute";
import "./App.css";

function App() {
  const [identifier, setIdentifier] = useState("");
  const [component, setComponent] = useState("");
  const [magicLinkToken, setMagicLinkToken] = useState<string | null>(null);
  const [tokenPayload, setTokenPayload] = useState<ScuteTokenPayload | null>(
    null
  );

  // Detect magic link token from URL and initiate verification
  useEffect(() => {
    const magicLinkToken = scuteClient.getMagicLinkToken();
    if (magicLinkToken) {
      setComponent("magic_verify");
      setMagicLinkToken(magicLinkToken);
    }
  }, [scuteClient]);

  // Check existing session on app load
  useEffect(() => {
    const getSession = async () => {
      const { data, error } = await scuteClient.getSession();
      console.log(data);
      if (error) {
        console.error(error);
      }
      if (data?.session && data.session.status === "authenticated") {
        setComponent("profile");
      } else {
        setComponent("login");
      }
    };
    getSession();
  }, []);

  return (
    <div className="app">
      {component === "profile" && <Profile setComponent={setComponent} />}
      {component === "login" && (
        <LoginForm
          scuteClient={scuteClient}
          identifier={identifier}
          setIdentifier={setIdentifier}
          setComponent={setComponent}
        />
      )}
      {component === "magic_verify" && (
        <MagicVerify
          scuteClient={scuteClient}
          magicLinkToken={magicLinkToken}
          setTokenPayload={setTokenPayload}
          setComponent={setComponent}
        />
      )}
      {component === "magic_sent" && <MagicSent identifier={identifier} />}
      {component === "register_device" && (
        <RegisterDevice
          scuteClient={scuteClient}
          tokenPayload={tokenPayload}
          setComponent={setComponent}
        />
      )}
      {component === "otp_verify" && (
        <OtpForm
          scuteClient={scuteClient}
          identifier={identifier}
          setComponent={setComponent}
          setTokenPayload={setTokenPayload}
        />
      )}
    </div>
  );
}
```

### Login Form Component

This is the main login form that handles multiple authentication methods. It supports passkey authentication (WebAuthn), magic links for email addresses, OTP for phone numbers, and OAuth with Google. The form intelligently determines the authentication method based on the identifier format.

```typescript
const LoginForm = ({
  scuteClient,
  identifier,
  setIdentifier,
  setComponent,
}: {
  scuteClient: ScuteClient;
  identifier: string;
  setIdentifier: (identifier: string) => void;
  setComponent: (component: string) => void;
}) => {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { data, error } = await scuteClient.signInOrUp(identifier);

    if (error) {
      console.log("signInOrUp error");
      return console.log({
        data,
        error,
        meaningfulError: error && getMeaningfulError(error),
      });
    }

    if (!data) {
      // Passkey verified successfully
      setComponent("profile");
    } else {
      // Need additional verification
      if (identifier.includes("@")) {
        setComponent("magic_sent");
      } else {
        setComponent("otp_verify");
      }
    }
  };

  const handleSendCode = async () => {
    if (identifier.includes("@")) {
      await scuteClient.sendLoginMagicLink(identifier);
      setComponent("magic_sent");
    } else {
      await scuteClient.sendLoginOtp(identifier);
      setComponent("otp_verify");
    }
  };

  const handleSignInWithGoogle = async () => {
    await scuteClient.signInWithOAuthProvider("google");
  };

  return (
    <form onSubmit={handleSubmit}>
      <h5>Sign in or up</h5>
      <p>
        Enter your email or phone number without any spaces{" "}
        <small>(eg. 12125551212)</small>
      </p>
      <input
        type="text"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <p style={{ fontSize: "0.625rem", textAlign: "left" }}>
        Try to sign in with a passkey if you have one. Will send a magic link or
        otp if no devices are registered for webauthn.
      </p>
      <button type="submit">Sign in or up</button>
      <hr />
      <p style={{ fontSize: "0.625rem", textAlign: "left" }}>
        Will always send a magic link or otp.
      </p>
      <button type="button" onClick={handleSendCode}>
        Send otp or magic link
      </button>
      <hr />
      <button type="button" onClick={handleSignInWithGoogle}>
        Sign in with Google
      </button>
    </form>
  );
};
```

### Magic Link Components

#### Magic Link Sent Component

A simple confirmation component that shows when a magic link has been sent to the user's email address.

```typescript
const MagicSent = ({ identifier }: { identifier: string }) => {
  return (
    <div className="card">
      <h5>Magic Link Sent</h5>
      <p>
        Please check <strong>{identifier}</strong> for the magic link.
      </p>
    </div>
  );
};
```

#### Magic Link Verification Component

This component automatically verifies magic link tokens when users click on magic links. It handles URL parameter cleanup and determines whether to proceed with device registration or direct sign-in based on the URL parameters.

```typescript
const MagicVerify = ({
  scuteClient,
  setComponent,
  magicLinkToken,
  setTokenPayload,
}: {
  scuteClient: ScuteClient;
  setComponent: (component: string) => void;
  magicLinkToken: string | null;
  setTokenPayload: (tokenPayload: ScuteTokenPayload | null) => void;
}) => {
  const url = new URL(window.location.href);
  const shouldSkipDeviceRegistration = !!url.searchParams.get(SCUTE_SKIP_PARAM);
  const verificationStarted = useRef(false);

  useEffect(() => {
    const verifyMagicLink = async () => {
      if (!magicLinkToken) {
        return console.log("no magic link token found");
      }

      const { data, error } = await scuteClient.verifyMagicLinkToken(
        magicLinkToken
      );
      if (error) {
        console.log("verifyMagicLink error");
        return console.log({
          data,
          error,
          meaningfulError: error && getMeaningfulError(error),
        });
      }

      if (!shouldSkipDeviceRegistration && data?.authPayload) {
        setTokenPayload(data.authPayload);
        setComponent("register_device");
      } else {
        setComponent("profile");
      }

      // Clean up URL parameters
      url.searchParams.delete(SCUTE_SKIP_PARAM);
      url.searchParams.delete(SCUTE_MAGIC_PARAM);
      window.history.replaceState({}, "", url.toString());
    };

    if (!verificationStarted.current) {
      verificationStarted.current = true;
      verifyMagicLink();
    }
  }, []);

  return (
    <div className="card">
      <h5>Verifying Magic Link...</h5>
    </div>
  );
};
```

### OTP Verification Component

This component handles one-time password verification for phone number authentication. It provides a simple form for users to enter the OTP they received via SMS.

```typescript
const OtpForm = ({
  scuteClient,
  identifier,
  setComponent,
  setTokenPayload,
}: {
  scuteClient: ScuteClient;
  identifier: string;
  setComponent: (component: string) => void;
  setTokenPayload: (tokenPayload: ScuteTokenPayload | null) => void;
}) => {
  const [otp, setOtp] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { data, error } = await scuteClient.verifyOtp(otp, identifier);
    if (error) {
      console.log("verifyOtp error");
      console.log({ data, error, meaningfulError: getMeaningfulError(error) });
      return;
    }

    if (data) {
      setTokenPayload(data.authPayload);
      setComponent("register_device");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h5>Enter OTP</h5>
      <input
        type="text"
        placeholder="OTP"
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
      />
      <button type="submit">Verify OTP</button>
    </form>
  );
};
```

### Device Registration Component

This component handles WebAuthn device registration, allowing users to register passkeys for passwordless authentication in future sessions. Users can choose to register a device or skip the registration process.

```typescript
export const RegisterDevice = ({
  scuteClient,
  tokenPayload,
  setComponent,
}: {
  scuteClient: ScuteClient;
  tokenPayload: ScuteTokenPayload | null;
  setComponent: (component: string) => void;
}) => {
  const handleRegisterDevice = async () => {
    if (!tokenPayload) {
      console.error("No token payload");
      return;
    }

    // Sign in with the token payload first
    const { error: signInError } = await scuteClient.signInWithTokenPayload(
      tokenPayload
    );
    if (signInError) {
      console.log("signInWithTokenPayload error");
      console.log({
        signInError,
        meaningfulError: getMeaningfulError(signInError),
      });
      return;
    }

    // Add the device for future passkey authentication
    const { data, error } = await scuteClient.addDevice();
    if (error) {
      console.log("addDevice error");
      console.log({ data, error, meaningfulError: getMeaningfulError(error) });
      return;
    }
    setComponent("profile");
  };

  const handleSkipDeviceRegistration = async () => {
    if (!tokenPayload) {
      console.error("No token payload");
      return;
    }

    const { error: signInError } = await scuteClient.signInWithTokenPayload(
      tokenPayload
    );
    if (signInError) {
      console.log("signInWithTokenPayload error");
      console.log({
        signInError,
        meaningfulError: getMeaningfulError(signInError),
      });
      return;
    }
    setComponent("profile");
  };

  return (
    <div className="card">
      <h5>Register Device</h5>
      <button onClick={handleRegisterDevice}>Register Device</button>
      <button onClick={handleSkipDeviceRegistration}>
        Skip Device Registration
      </button>
    </div>
  );
};
```

### Profile Component

The profile component displays user information and manages active sessions. It shows user data, allows users to sign out, and provides session management functionality including the ability to revoke individual sessions.

```typescript
const Profile = ({
  setComponent,
}: {
  setComponent: (component: string) => void;
}) => {
  const [user, setUser] = useState<ScuteUserData | null>(null);

  useEffect(() => {
    const getSession = async () => {
      const { data, error } = await scuteClient.getSession();
      if (error) {
        console.error(error);
      }
      if (!data?.session || data.session.status === "unauthenticated") {
        setComponent("login");
      } else {
        setUser(data.user);
      }
    };
    getSession();
  }, []);

  return (
    <>
      <div className="card" style={{ width: "420px" }}>
        <h5>Profile</h5>
        <pre style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>
          {user
            ? JSON.stringify({ ...user, sessions: "[...]" }, null, 2)
            : "Loading..."}
        </pre>
        <button
          onClick={async () => {
            await scuteClient.signOut();
            setComponent("login");
          }}
        >
          Sign Out
        </button>
      </div>

      <div style={{ width: "420px" }}>
        <h5>Sessions</h5>
        <ul style={{ textAlign: "left" }}>
          {user?.sessions
            ? user?.sessions.map((session) => (
                <li
                  className="card"
                  style={{
                    width: "420px",
                    textAlign: "left",
                    padding: "10px",
                    margin: "10px",
                  }}
                  key={session.id}
                >
                  <p>{session.id}</p>
                  <pre style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(session, null, 2)}
                  </pre>
                  <p>
                    <button
                      onClick={() =>
                        scuteClient.revokeSession(session.id).then(() => {
                          window.location.reload();
                        })
                      }
                    >
                      Delete Session
                    </button>
                  </p>
                </li>
              ))
            : "Loading..."}
        </ul>
      </div>
    </>
  );
};
```

## Styling

The example includes basic CSS styling for a clean, responsive interface. Here's the basic styling approach:

```css
.app {
  display: flex;
  flex-direction: column;
  gap: 32px;
  grid-row-start: 2;
  align-items: center;
  justify-content: center;
}

form,
.card {
  width: 320px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid #ccc;
  padding: 16px;
  border-radius: 8px;
}
```

The styling includes:

- Dark mode support with CSS custom properties
- Responsive design principles
- Clean card-based layout for forms
- Consistent spacing and typography

## Environment Configuration

Create a `.env` file in your project root to store your Scute configuration securely. Vite uses the `VITE_` prefix to make environment variables available in your client-side code.

```env
# Rename this file as .env and enter the app id and base url
VITE_SCUTE_APP_ID=<your_app_id>
VITE_SCUTE_BASE_URL=https://api.scute.io
```

## Key Features Demonstrated

### 1. Multiple Authentication Methods

- **Passkey Authentication**: WebAuthn-based passwordless authentication
- **Magic Links**: Email-based authentication with secure tokens
- **OTP Verification**: SMS-based one-time password authentication
- **OAuth**: Social login with Google (and other providers)

### 2. Session Management

- Automatic session detection on app load
- Session persistence across page refreshes
- Multi-device session management
- Individual session revocation

### 3. Device Registration

- Optional WebAuthn device registration
- Passkey creation for future passwordless logins
- Skip option for users who prefer traditional methods

### 4. Error Handling

- Comprehensive error handling with meaningful error messages
- Graceful fallbacks for authentication failures
- User-friendly error display

### 5. URL Parameter Handling

- Magic link token extraction from URLs
- Clean URL management after authentication
- Support for skip parameters in magic links

## Development Workflow

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp env.example .env
# Edit .env with your actual Scute app ID and base URL
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Build for Production

```bash
npm run build
```

## Important Notes

1. **Client-Side Only**: This implementation is purely client-side and suitable for SPAs
2. **Security**: Environment variables are exposed to the client, ensure they're safe for public access
3. **WebAuthn Support**: Passkey functionality requires HTTPS in production
4. **Error Handling**: Always implement proper error handling for network failures
5. **Session Management**: The client automatically handles session persistence and renewal
6. **Magic Links**: Ensure your email service is properly configured for magic link delivery
7. **OAuth Redirects**: Configure OAuth redirect URLs in your OAuth provider settings

This implementation provides a complete authentication system with multiple authentication methods, comprehensive session management, and excellent user experience for web applications using React and Scute's JS Core package.
