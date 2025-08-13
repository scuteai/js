# Scute JS React Hooks Integration Guide

This example uses react hooks instead of the core library. Check the [core library implementation](https://github.com/scuteai/js/tree/main/examples/with-react-and-core) for more details.

## Installation

First, install the required packages. The `@scute/react-hooks` package provides React-specific hooks and context for authentication.

```bash
npm install @scute/react-hooks react react-dom
```

For development, you'll also need TypeScript and Vite for the best development experience:

```bash
npm install -D typescript @types/react @types/react-dom @vitejs/plugin-react vite
```

## Setup

### 1. Project Structure

Your React app structure should look like this:

```
src/
├── App.tsx          # Main app component with auth flow
├── App.css          # Styling for the app
├── main.tsx         # React app entry point
├── providers.tsx    # Auth provider and context setup
└── index.css        # Global styles
```

### 2. Auth Provider Setup

Create a providers file (`providers.tsx`) to set up the authentication context and client:

```typescript
import { type ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@scute/react-hooks";
import { AuthContextProvider, useAuth } from "@scute/react-hooks";

type ProvidersProps = {
  children: ReactNode;
};

export default function Providers({ children }: ProvidersProps) {
  return <AuthProvider>{children}</AuthProvider>;
}

function AuthProvider({ children }: ProvidersProps) {
  const [scuteClient] = useState(() =>
    createClient({
      appId: import.meta.env.VITE_SCUTE_APP_ID,
      baseUrl: import.meta.env.VITE_SCUTE_BASE_URL,
    })
  );

  return (
    <AuthContextProvider scuteClient={scuteClient}>
      <ClientAuthGuard>{children}</ClientAuthGuard>
    </AuthContextProvider>
  );
}

const ClientAuthGuard = ({ children }: ProvidersProps) => {
  const { session } = useAuth();

  const guard = useCallback(
    () =>
      location.pathname.startsWith("/profile") &&
      session.status === "unauthenticated",
    [session.status]
  );

  useEffect(() => {
    if (guard()) {
      window.location.href = "/";
    }
  }, [guard]);

  if (guard()) {
    return null;
  }

  return <>{children}</>;
};
```

### 3. Main App Entry Point

In your `main.tsx`, wrap your app with the auth provider:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import Providers from "./providers.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>
);
```

## Using Authentication Hooks

### Accessing Auth State

The `useAuth` hook provides access to the current authentication state and user data:

```typescript
import { useAuth } from "@scute/react-hooks";

function Profile() {
  const { user, session } = useAuth();

  if (session.status === "unauthenticated") {
    return <Navigate to="/login" />;
  }

  return (
    <div>
      <h1>Welcome {user?.email}</h1>
    </div>
  );
}
```

### Accessing Scute Client

The `useScuteClient` hook provides access to the Scute client instance:

```typescript
import { useScuteClient } from "@scute/react-hooks";

function LoginForm() {
  const scuteClient = useScuteClient();

  const handleLogin = async (email: string) => {
    const { error } = await scuteClient.signInOrUp(email);
    if (error) {
      console.error(error);
    }
  };

  return <form onSubmit={...}>...</form>;
}
```

## Complete Authentication Flow Implementation

The authentication flow includes:

1. Auth Context Provider that manages the global auth state
2. Auth Guard that protects authenticated routes
3. Components for different authentication methods:
   - Passkey authentication (WebAuthn)
   - Magic links
   - OTP verification
   - OAuth providers

## Environment Configuration

Create a `.env` file in your project root:

```env
# Rename this file as .env and enter the app id and base url
VITE_SCUTE_APP_ID=<your_app_id>
VITE_SCUTE_BASE_URL=https://api.scute.io
```

## Key Features

### 1. React-Specific Integration

- React hooks for auth state management
- Context-based auth provider
- Route protection with auth guard
- TypeScript support

### 2. Multiple Authentication Methods

- Passkey Authentication (WebAuthn)
- Magic Links
- OTP Verification
- OAuth Providers

### 3. Session Management

- Automatic session detection and persistence
- Multi-device session management
- Session revocation

### 4. Device Registration

- WebAuthn device registration
- Passkey creation
- Skip option available

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

1. **React Integration**: This implementation uses React-specific hooks and context
2. **Security**: Environment variables are exposed to the client
3. **WebAuthn Support**: Passkey functionality requires HTTPS in production
4. **Error Handling**: Implement proper error handling for network failures
5. **Session Management**: Automatic session handling through context
6. **Magic Links**: Configure email service for magic link delivery
7. **OAuth Redirects**: Configure OAuth redirect URLs in provider settings

This implementation provides a complete authentication system using React hooks and context, offering multiple authentication methods and comprehensive session management for React applications.
