import { useAuth, useScuteClient } from "@scute/react";
import { Profile } from "@scute/ui-react";

const ProfilePage = () => {
  const scute = useScuteClient();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  } else if (!isAuthenticated) {
    return "unauthenticated";
  }

  return <Profile scuteClient={scute} />;
};

export default ProfilePage;