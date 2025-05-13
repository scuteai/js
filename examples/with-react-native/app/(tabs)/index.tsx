import { Image } from "expo-image";
import { StyleSheet, TextInput, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { HelloWave } from "@/components/HelloWave";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useScuteClient } from "@scute/react-hooks";
import { useState } from "react";
import { router } from "expo-router";

export default function HomeScreen() {
  const scuteClient = useScuteClient();
  const [identifier, setIdentifier] = useState("");
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [otp, setOtp] = useState("");
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
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome!</ThemedText>
        <HelloWave />
      </ThemedView>

      {!showOtpForm ? (
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

          <TouchableOpacity style={styles.googleButton}>
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
      ) : (
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
    padding: 20,
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
