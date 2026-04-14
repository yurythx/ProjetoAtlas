import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ErrorBoundary } from "@/components/error-boundary";
import { DevServiceWorkerReset } from "@/components/dev-sw-reset";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { ThemeInitScript } from "@/components/theme-init-script";

export const dynamic = 'force-dynamic'


export const metadata: Metadata = {
  title: "Atlas - ITIL version 5 Suite",
  description: "ITIL version 5 Suite Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <DevServiceWorkerReset />
        <Providers>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
