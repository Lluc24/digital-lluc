import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Background } from "@/Background";
import { SiteFooter } from "@/SiteFooter";
import { SiteHeader } from "@/SiteHeader";
import { THEME_BOOT_SCRIPT } from "@/theme-boot";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lluc Santamaria, talk to me",
  description:
    "Talk or type with digital-lluc: an AI version of Lluc Santamaria, voice AI engineer, built on the same stack he works on.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script that sets the theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-slate-100 font-sans text-night antialiased dark:bg-night dark:text-white">
        <div className="relative min-h-screen overflow-clip">
          <Background />
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
