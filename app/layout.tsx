import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Automation",
  description: "CRM Automation is a private CRM for companies, contacts, deals and requirements.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
