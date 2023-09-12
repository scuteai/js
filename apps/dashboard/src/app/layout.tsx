import "@radix-ui/themes/styles.css";
import "@/styles/globals.scss";

import type { Metadata } from "next";
import Providers from "./providers";

export const metadata: Metadata = {
  title: {
    template: "%s | Scute",
    default: "Scute",
  },
  description: "Scute.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
