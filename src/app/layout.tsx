import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { AppProviders } from "@/providers/AppProviders";
import { NotificationManager } from "@/components/NotificationManager";
import { NetworkStatusBanner } from "@/components/ui/NetworkStatusBanner";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "ChefFlow IA — Restaurant SaaS POS Dashboard",
  description: "Sistema de gestión integral para restaurantes con IA, domicilios, caja POS y automatización.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ChefFlow",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.jpg", type: "image/jpeg", sizes: "32x32" },
    ],
    apple: [
      { url: "/icon-192.jpg", type: "image/jpeg", sizes: "192x192" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#FF6B35",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${outfit.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />
        {/* Favicon SVG — shown in browser tab */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.jpg" type="image/jpeg" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icon-192.jpg" />
        {/* DO NOT add rel="manifest" here — Next.js adds it automatically via src/app/manifest.ts */}
      </head>
      <body className="min-h-full flex flex-col font-[var(--font-outfit)]" suppressHydrationWarning>
        <AppProviders>
          {children}
          <NotificationManager />
          <NetworkStatusBanner />
        </AppProviders>
      </body>
    </html>
  );
}
