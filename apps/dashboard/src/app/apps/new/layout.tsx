import { type Metadata } from "next";
import GuardLayout from "../../guard-layout";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Create new app",
  };
}

export default function NewAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GuardLayout pageTitle="Create new app">{children}</GuardLayout>;
}
