import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "VacTech Service Portal",
  description: "Equipment service visibility for VacTech customers.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render every page per request so it carries the Content Security Policy nonce from
  // src/proxy.ts. A prerendered page would ship scripts without the nonce and be blocked.
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
