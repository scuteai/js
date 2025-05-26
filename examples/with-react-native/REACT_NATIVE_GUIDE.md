# Scute React Native Integration Guide

## Installation

First, install the required packages. The `@scute/react-hooks` package provides React hooks for authentication, while `react-native-webview` is needed for OAuth flows that require opening external authentication pages within your app.

```bash
npm install @scute/react-hooks react-native-webview
```

For Expo projects, you might also need to install the WebView package through Expo's CLI to ensure proper native module linking:

```bash
expo install react-native-webview
```

## Setup

### 1. Initialize Scute Client

Create a client instance in `scute.ts`. This client will handle all authentication operations and API calls to your Scute backend. The configuration requires your app ID and base URL, which should be stored as environment variables for security.

```typescript
import { createClient } from "@scute/react-hooks";

export const scuteClient = createClient({
  appId: process.env.EXPO_PUBLIC_SCUTE_APP_ID!,
  baseUrl: process.env.EXPO_PUBLIC_SCUTE_BASE_URL!,
});
```

### 2. Wrap Your App with AuthProvider

In your root layout component (`_layout.tsx`), wrap your entire app with the `AuthContextProvider`. This provider makes the authentication state and client instance available to all components in your app through React Context, allowing you to access user data and authentication methods anywhere in your component tree.

```typescript
import { AuthContextProvider } from "@scute/react-hooks";
import { scuteClient } from "@/scute";

export default function RootLayout() {
  return (
    <AuthContextProvider scuteClient={scuteClient}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </AuthContextProvider>
  );
}
```

## Complete Login Form Implementation

### State Management

Set up the necessary state variables to manage the authentication flow. The `identifier` stores the user's email or phone number, `otp` holds the verification code, `showOtpForm` controls which form is displayed, and `oAuthUrl` manages the OAuth WebView state. The `SCUTE_MAGIC_PARAM` is used to detect successful OAuth callbacks.

```typescript
import { useState } from "react";
import { useScuteClient, SCUTE_MAGIC_PARAM } from "@scute/react-hooks";
import { WebView } from "react-native-webview";

export default function LoginScreen() {
  const scuteClient = useScuteClient();

  // Form states
  const [identifier, setIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [oAuthUrl, setOAuthUrl] = useState<string | null>(null);
}
```

### Email/Phone Login Form

This is the initial login form that users see when they're not authenticated. It provides two authentication options: email/phone with OTP verification, and Google OAuth. The form only renders when neither the OTP form nor OAuth WebView is active. When users enter their identifier and tap "Sign in", it sends an OTP to their email or phone and transitions to the verification form.

```typescript
// Initial login form
{
  !showOtpForm && !oAuthUrl && (
    <View style={styles.authContainer}>
      <TextInput
        style={styles.input}
        placeholder="Email or phone number"
        placeholderTextColor="#666"
        keyboardType="email-address"
        autoCapitalize="none"
        value={identifier}
        onChangeText={setIdentifier}
      />

      <TouchableOpacity
        style={styles.signInButton}
        onPress={async () => {
          await scuteClient.sendLoginOtp(identifier);
          setShowOtpForm(true);
        }}
      >
        <Text style={styles.buttonText}>Sign in / Sign up</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.googleButton}
        onPress={() => {
          const url = scuteClient.getOAuthUrl("google");
          setOAuthUrl(url);
        }}
      >
        <Ionicons name="logo-google" size={20} color="#fff" />
        <Text style={styles.buttonText}>Sign in with Google</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### OTP Verification Form

This form appears after users request an OTP and allows them to enter the verification code they received. The numeric keyboard type makes it easier for users to input the code. When verification succeeds, the app signs in the user with the returned authentication payload and navigates to the profile screen. The back button allows users to return to the initial login form if needed.

```typescript
// OTP verification form
{
  showOtpForm && (
    <View style={styles.authContainer}>
      <TextInput
        style={styles.input}
        placeholder="Enter the code you received"
        placeholderTextColor="#666"
        keyboardType="numeric"
        autoCapitalize="none"
        value={otp}
        onChangeText={setOtp}
      />

      <TouchableOpacity
        style={styles.signInButton}
        onPress={async () => {
          const { data, error } = await scuteClient.verifyOtp(otp, identifier);
          if (error) {
            console.log(error);
          } else {
            scuteClient.signInWithTokenPayload(data.authPayload);
            setShowOtpForm(false);
            router.push("/profile");
          }
        }}
      >
        <Text style={styles.buttonText}>Verify</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.signInButton}
        onPress={() => setShowOtpForm(false)}
      >
        <Text style={styles.buttonText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}
```

## OAuth WebView Implementation

### WebView Configuration

Configure platform-specific user agents to ensure OAuth providers recognize your app as a legitimate mobile browser. Different OAuth providers may have different requirements or behaviors based on the user agent string, so using platform-appropriate values helps avoid authentication issues and improves compatibility.

```typescript
import { Platform } from "react-native";

// User agent configuration for better compatibility
const userAgent = Platform.select({
  android:
    "Mozilla/5.0 (Linux; Android 10; Android SDK built for x86) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
});
```

### Complete WebView Component

This WebView component handles the OAuth authentication flow by loading the OAuth provider's authentication page. It monitors URL changes to detect when the OAuth flow completes and returns to your app with an authorization code. The component includes comprehensive error handling, cookie management for session persistence, and proper security settings. When the OAuth callback is detected (via the magic parameter), it verifies the token and signs in the user automatically.

```typescript
{
  oAuthUrl && (
    <ScrollView>
      <View style={{ ...styles.authContainer, height: "100%" }}>
        <WebView
          source={{ uri: oAuthUrl }}
          style={{ height: 550, width: "100%" }}
          userAgent={userAgent}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          domStorageEnabled={true}
          setSupportMultipleWindows={false}
          originWhitelist={["*"]}
          pullToRefreshEnabled={true}
          webviewDebuggingEnabled={true}
          startInLoadingState={true}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn("WebView error: ", nativeEvent);
          }}
          onHttpError={(event) => {
            console.log("HTTP error", event);
          }}
          onMessage={(event) => {
            console.log("Message from webview:", event.nativeEvent.data);
          }}
          onNavigationStateChange={async (event) => {
            const url = new URL(event.url);
            const code = url.searchParams.get(SCUTE_MAGIC_PARAM);

            if (!code) {
              return;
            }

            const { data, error } = await scuteClient.verifyMagicLinkToken(
              code
            );
            if (error) {
              console.log(error);
            } else {
              scuteClient.signInWithTokenPayload(data.authPayload);
              setOAuthUrl("");
              router.push("/profile");
            }
          }}
        />

        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => setOAuthUrl(null)}
        >
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
```

### Key WebView Properties Explained

| Property                   | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `sharedCookiesEnabled`     | Enables cookie sharing between WebView and native app |
| `thirdPartyCookiesEnabled` | Allows third-party cookies (required for OAuth)       |
| `domStorageEnabled`        | Enables localStorage and sessionStorage               |
| `originWhitelist={["*"]}`  | Allows navigation to any URL                          |
| `userAgent`                | Sets custom user agent for better compatibility       |
| `onNavigationStateChange`  | Monitors URL changes to detect OAuth callback         |

## Authentication State Management

### Using Authentication Hooks

Use the `useAuth` hook to access the current authentication state and user information throughout your app. This hook provides reactive updates when the authentication state changes, automatically re-rendering components when users sign in or out. The example shows how to implement route protection by checking the session status and redirecting unauthenticated users to the login screen.

```typescript
import { useAuth, useScuteClient } from "@scute/react-hooks";

function ProfileScreen() {
  const { session, user } = useAuth();
  const scuteClient = useScuteClient();

  // Check authentication status
  if (session.status === "unauthenticated") {
    return (
      <View style={styles.container}>
        <Text style={styles.warningText}>
          You need to log in first to view your profile
        </Text>
        <Pressable style={styles.loginButton} onPress={() => router.push("/")}>
          <Text style={styles.loginButtonText}>Go to Login</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        style={styles.signoutButton}
        onPress={() => scuteClient.signOut()}
      >
        <Text style={styles.signoutButtonText}>Sign Out</Text>
      </Pressable>
      <Text>{JSON.stringify(user, null, 2)}</Text>
    </View>
  );
}
```

## Environment Configuration

Create a `.env` file in your project root to store your Scute configuration securely. The `EXPO_PUBLIC_` prefix makes these variables available in your React Native code while keeping them separate from your source code. Replace the placeholder values with your actual Scute app ID and the URL of your Scute backend instance.

```env
EXPO_PUBLIC_SCUTE_APP_ID=your_app_id_here
EXPO_PUBLIC_SCUTE_BASE_URL=https://your-scute-instance.com
```

## Important Notes

1. **WebView Security**: The WebView configuration includes security settings for OAuth flows
2. **URL Monitoring**: `onNavigationStateChange` detects the OAuth callback with the magic parameter
3. **Error Handling**: Implement proper error handling for network issues and authentication failures
4. **User Agent**: Custom user agents improve compatibility with OAuth providers
5. **State Management**: Use React state to manage form visibility and authentication flow

This implementation provides a complete authentication system with both email/phone OTP and OAuth support using React Native WebView.
