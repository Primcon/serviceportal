import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VacTech Service Portal",
  description: "Equipment service visibility for VacTech customers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
