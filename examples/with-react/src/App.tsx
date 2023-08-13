import { AuthContextProvider } from "@scute/react";
import WithScuteUI from "./components/WithScuteUI";
import { scute } from "./scute";

export default function App() {
  return (
    <AuthContextProvider scuteClient={scute}>
      {/* <WithCustomUI /> */}
      <WithScuteUI />
    </AuthContextProvider>
  );
}
