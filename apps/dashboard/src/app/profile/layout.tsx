import { Layout } from "@/components/shared/Layout";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Layout>{children}</Layout>;
}
