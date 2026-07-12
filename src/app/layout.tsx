import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vulcan OmniPro 220 — AI Welder Console",
  description: "An agentic workspace to troubleshoot, calibrate, and configure the Vulcan OmniPro 220 welder.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
