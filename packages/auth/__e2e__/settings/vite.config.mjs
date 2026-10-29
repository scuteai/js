// The test page: ScuteSignIn and the SDK as an app ships them (the packages'
// built dist), pointed at SCUTE_E2E_API_URL. The app id comes from the
// page's query string (?app=app_...).
import { defineConfig } from "vite";
import { loadSettingsEnv } from "./lib/env.mjs";

const loaded = loadSettingsEnv();
if (!loaded.ok) throw new Error(loaded.reason);
const { apiUrl, pagePort } = loaded.env;

export default defineConfig({
  root: new URL("./app", import.meta.url).pathname,
  define: { __SCUTE_API_URL__: JSON.stringify(apiUrl) },
  server: { port: pagePort, strictPort: true, host: "localhost" },
  logLevel: "warn",
});
