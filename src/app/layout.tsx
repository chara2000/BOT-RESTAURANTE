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
        {/* Bulletproof shield against Chromium DevTools Issue 543499029 (Live Metrics/devToolsReportSoftNavs/reportAllChanges startTime crash) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window === 'undefined') return;

                // 1. Disable Chrome DevTools Soft Navigation tracking that triggers the unhandled startTime crash
                try {
                  Object.defineProperty(window, 'devToolsReportSoftNavs', {
                    get: function() { return false; },
                    set: function() { /* Prevent DevTools from enabling soft navigation tracking */ },
                    configurable: true,
                    enumerable: true
                  });
                } catch (e) {}

                // 2. Kill switch for Chromium Live Metrics if already instantiated
                try {
                  if (typeof window.__chromium_devtools_kill_live_metrics === 'function') {
                    window.__chromium_devtools_kill_live_metrics();
                  }
                } catch (e) {}

                var isTelemetryError = function(msg, stack) {
                  var m = String(msg || '');
                  var s = String(stack || '');
                  return (
                    (m.indexOf('startTime') !== -1 || s.indexOf('startTime') !== -1) &&
                    (m.indexOf('reportAllChanges') !== -1 ||
                     s.indexOf('reportAllChanges') !== -1 ||
                     m.indexOf('devToolsReportSoftNavs') !== -1 ||
                     s.indexOf('devToolsReportSoftNavs') !== -1 ||
                     s.indexOf('web-vitals') !== -1 ||
                     s.indexOf('anonymous') !== -1 ||
                     s.indexOf('VM') !== -1)
                  );
                };

                // 3. window.onerror: Returning true explicitly tells the browser host NOT to print "Uncaught ..." to DevTools
                var prevOnError = window.onerror;
                window.onerror = function(message, source, lineno, colno, error) {
                  var msg = typeof message === 'string' ? message : (error && error.message) || '';
                  var stack = (error && error.stack) || '';
                  if (isTelemetryError(msg, stack)) {
                    return true;
                  }
                  if (typeof prevOnError === 'function') {
                    return prevOnError.apply(this, arguments);
                  }
                  return false;
                };

                // 4. Capture phase error listener (runs before bubbling listeners)
                window.addEventListener(
                  'error',
                  function(e) {
                    var msg = (e && e.message) || '';
                    var stack = (e && e.error && e.error.stack) || '';
                    if (isTelemetryError(msg, stack)) {
                      e.stopImmediatePropagation();
                      e.preventDefault();
                      return true;
                    }
                  },
                  true
                );

                // 5. Unhandled Promise Rejections (e.g. within requestIdleCallback / scheduler)
                window.addEventListener(
                  'unhandledrejection',
                  function(e) {
                    var reason = (e && e.reason) || {};
                    var msg = (reason && (reason.message || String(reason))) || '';
                    var stack = (reason && reason.stack) || '';
                    if (isTelemetryError(msg, stack)) {
                      e.stopImmediatePropagation();
                      e.preventDefault();
                    }
                  },
                  true
                );

                // 6. Console.error filter to prevent spurious DevTools red error blocks
                var origConsoleError = console.error;
                console.error = function() {
                  for (var i = 0; i < arguments.length; i++) {
                    var arg = arguments[i];
                    var str = '';
                    if (typeof arg === 'string') {
                      str = arg;
                    } else if (arg && arg.message) {
                      str = arg.message + ' ' + (arg.stack || '');
                    } else if (arg && arg.stack) {
                      str = String(arg.stack);
                    }
                    if (isTelemetryError(str, str)) {
                      return;
                    }
                  }
                  return origConsoleError.apply(console, arguments);
                };
              })();
            `,
          }}
        />
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
