import { type Metadata } from "next";
import GuardLayout from "../guard-layout";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Profile",
  };
}

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GuardLayout pageTitle="Profile">{children}</GuardLayout>;
}
