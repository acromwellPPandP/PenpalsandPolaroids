import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Penpals & Polaroids",
  description:
    "Connect with people from other countries by sending one thoughtful letter and exactly one photo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
