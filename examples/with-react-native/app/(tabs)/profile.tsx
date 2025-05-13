import { StyleSheet, Pressable } from "react-native";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useAuth, useScuteClient } from "@scute/react-hooks";
import { router } from "expo-router";

export default function TabTwoScreen() {
  const { session, user } = useAuth();
  const scuteClient = useScuteClient();

  if (session.status === "unauthenticated") {
    return (
      <ThemedView style={styles.container}>
        <IconSymbol
          size={100}
          color="#808080"
          name="exclamationmark.triangle.fill"
          style={styles.warningIcon}
        />
        <ThemedText style={styles.warningText}>
          You need to log in first to view your profile
        </ThemedText>
        <Pressable style={styles.loginButton} onPress={() => router.push("/")}>
          <ThemedText style={styles.loginButtonText}>Go to Login</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#D0D0D0", dark: "#353636" }}
      headerImage={
        <IconSymbol
          size={310}
          color="#808080"
          name="person.fill"
          style={styles.headerImage}
        />
      }
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Profile</ThemedText>
      </ThemedView>
      {/* Signout button */}
      <Pressable
        style={styles.signoutButton}
        onPress={() => scuteClient.signOut()}
      >
        <ThemedText style={styles.signoutButtonText}>Signout</ThemedText>
      </Pressable>
      <ThemedText>{JSON.stringify(user, null, 2)}</ThemedText>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  warningIcon: {
    marginBottom: 20,
  },
  warningText: {
    fontSize: 18,
    textAlign: "center",
    marginBottom: 30,
  },
  loginButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  signoutButton: {
    backgroundColor: "red",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  signoutButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  headerImage: {
    color: "#808080",
    bottom: -90,
    left: -35,
    position: "absolute",
  },
  titleContainer: {
    flexDirection: "row",
    gap: 8,
  },
});
