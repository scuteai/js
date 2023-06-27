import { Auth } from "@scute/ui-react";
import WithCustomUI from "./components/WithCustomUI";
import WithScuteUI from "./components/WithScuteUI";
import { scute } from "./scute";

export default function App() {
  return (
    <Auth.ContextProvider scuteClient={scute}>
      <WithCustomUI />
      {/* <WithScuteUI /> */}
    </Auth.ContextProvider>
  );
}
