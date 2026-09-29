import type { Metadata } from "next";
import { Open_Sans, Roboto } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

// Fonts are downloaded at build time and served from the portal itself.
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans", display: "swap" });
const roboto = Roboto({ subsets: ["latin"], variable: "--font-roboto", display: "swap" });

export const metadata: Metadata = {
  title: "VacTech Service Portal",
  description: "Equipment service visibility for VacTech customers.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render every page per request so it carries the Content Security Policy nonce from
  // src/proxy.ts. A prerendered page would ship scripts without the nonce and be blocked.
  await connection();
  return (
    <html className={`${openSans.variable} ${roboto.variable}`} lang="en">
      <body>{children}</body>
    </html>
  );
}
