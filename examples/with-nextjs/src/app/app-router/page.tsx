import { cookies } from "next/headers";
import { createServerComponentClient } from "@scute/nextjs";
import Auth from "./Auth";

export default async function AppRouter() {
  const scute = createServerComponentClient({ cookies });

  const { data: appData, error } = await scute.getAppData();
  if (error) {
    return <>error</>;
  }

  const appName = appData.name;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      <div style={{ width: "100%", textAlign: "center" }}>
        <span> App Name: {appName}</span>
      </div>
      <Auth />
    </div>
  );
}
