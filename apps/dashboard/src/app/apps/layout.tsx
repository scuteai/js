import { Layout } from "@/components/shared/Layout";

export default function AppsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Layout>{children}</Layout>;
}
