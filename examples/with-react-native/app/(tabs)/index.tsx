import { Image } from "expo-image";
import {
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { HelloWave } from "@/components/HelloWave";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import {
  SCUTE_MAGIC_PARAM,
  SCUTE_OAUTH_PKCE_PARAM,
  useScuteClient,
} from "@scute/react-hooks";
import { useState } from "react";
import { router } from "expo-router";
import { WebView } from "react-native-webview";

const userAgent = Platform.select({
  android:
    "Mozilla/5.0 (Linux; Android 10; Android SDK built for x86) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
});

export default function HomeScreen() {
  const scuteClient = useScuteClient();
  const [identifier, setIdentifier] = useState("");
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [otp, setOtp] = useState("");
  const [oAuthUrl, setOAuthUrl] = useState<string | null>(null);

  if (oAuthUrl) {
    return (
      <ScrollView>
        <ThemedView style={{ ...styles.authContainer, height: "100%" }}>
          <WebView
            source={{ uri: oAuthUrl }}
            style={{ height: 550, width: "100%" }}
            userAgent={userAgent}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            setSupportMultipleWindows={false}
            originWhitelist={["*"]}
            pullToRefreshEnabled={true}
            webviewDebuggingEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.warn("WebView error: ", nativeEvent);
            }}
            onHttpError={(event) => {
              console.log("http error", event);
            }}
            onMessage={(event) => {
              console.log("Message from webview:", event.nativeEvent.data);
            }}
            onNavigationStateChange={async (event) => {
              const url = new URL(event.url);
              const code =
                url.searchParams.get(SCUTE_MAGIC_PARAM) ||
                url.searchParams.get(SCUTE_OAUTH_PKCE_PARAM);

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
                setShowOtpForm(false);
                router.push("/profile");
              }
            }}
          />
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => setOAuthUrl(null)}
          >
            <ThemedText style={styles.buttonText}>Back</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ScrollView>
    );
  }

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#A1CEDC", dark: "#1D3D47" }}
      headerImage={
        <Image
          source={require("@/assets/images/partial-react-logo.png")}
          style={styles.reactLogo}
        />
      }
    >
      {!oAuthUrl && (
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">Welcome!</ThemedText>
          <HelloWave />
        </ThemedView>
      )}

      {/* Sign in / Sign up */}
      {!showOtpForm && !oAuthUrl && (
        <ThemedView style={styles.authContainer}>
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
            <ThemedText style={styles.buttonText}>Sign in / Sign up</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.googleButton}
            onPress={() => {
              console.log("google");
              const url = scuteClient.getOAuthUrl("google");
              setOAuthUrl(url);
            }}
          >
            <Ionicons
              name="logo-google"
              size={20}
              color="#fff"
              style={styles.googleIcon}
            />
            <ThemedText style={styles.buttonText}>
              Sign in with Google
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}

      {/* OTP */}

      {showOtpForm && (
        <ThemedView style={styles.authContainer}>
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
              const { data, error } = await scuteClient.verifyOtp(
                otp,
                identifier
              );
              if (error) {
                console.log(error);
              } else {
                scuteClient.signInWithTokenPayload(data.authPayload);
                setShowOtpForm(false);
                router.push("/profile");
              }
            }}
          >
            <ThemedText style={styles.buttonText}>Verify</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => setShowOtpForm(false)}
          >
            <ThemedText style={styles.buttonText}>Back</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      )}
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: "absolute",
  },
  authContainer: {
    padding: 0,
    gap: 16,
    marginTop: 20,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  signInButton: {
    backgroundColor: "#007AFF",
    height: 50,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  googleButton: {
    backgroundColor: "#DB4437",
    height: 50,
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  googleIcon: {
    marginRight: 8,
  },
});
