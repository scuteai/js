import { Content, Wrapper } from "@scute/ui";
import { AppLayout } from "@/components/shared/AppLayout";
import { AppSidebar } from "@/components/shared/AppSidebar";

import { ScuteApp } from "../../../types";

const apps: ScuteApp[] = [
  {
    id: "s3414dfa",
    name: "Scute dashboard",
    slug: "scute-d",
    url: "control.scute.io",
  },
  {
    id: "s3414dfa1",
    name: "Example app",
    slug: "example",
    url: "example.scute.io",
  },
];

export default function AppSingleHome() {
  return (
    <AppLayout>
      <Wrapper>
        <AppSidebar />
        <Content>yomama</Content>
      </Wrapper>
    </AppLayout>
  );
}
