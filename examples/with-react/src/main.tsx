import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Auth } from "@scute/auth-ui-react";
import { scuteClient } from "./scute";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Auth.ContextProvider
      scuteClient={scuteClient}
    >
      <App />
    </Auth.ContextProvider>
  </React.StrictMode>
);
