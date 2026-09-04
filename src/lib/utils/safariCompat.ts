/**
 * Safari & WebKit Compatibility Utilities & API Fallbacks.
 * Prevents runtime errors when modern Web APIs are unsupported or blocked
 * on iOS Safari, iPadOS, or inside WebKit WebViews.
 */

/**
 * Safe Share API wrapper for iOS Safari.
 */
export async function safeShare(data: { title?: string; text?: string; url?: string }): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (typeof navigator !== 'undefined' && 'share' in navigator && navigator.share) {
    try {
      await navigator.share(data);
      return true;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('[SafariCompat] Native share failed:', err);
      }
    }
  }

  // Fallback to Clipboard API or Prompt
  if (data.url) {
    return safeCopyToClipboard(data.url);
  }
  return false;
}

/**
 * Safe Clipboard Write wrapper for Safari.
 * WebKit requires clipboard write to be triggered directly by a user gesture.
 */
export async function safeCopyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallthrough to execCommand fallback
    }
  }

  // WebKit fallback using legacy textarea
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (e) {
    console.warn('[SafariCompat] Legacy copy fallback failed:', e);
    return false;
  }
}

/**
 * Safe Notification Permission request wrapper for Safari iOS.
 */
export async function safeRequestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  try {
    if (typeof Notification.requestPermission === 'function') {
      return await Notification.requestPermission();
    }
  } catch {
    // Safari legacy callback support
    return new Promise((resolve) => {
      Notification.requestPermission((result) => resolve(result));
    });
  }

  return 'denied';
}

/**
 * Neutralizes Chromium DevTools Issue 543499029 (Live Metrics/devToolsReportSoftNavs/reportAllChanges startTime crash).
 */
export function applyBrowserStabilityGuards(): void {
  if (typeof window === 'undefined') return;

  try {
    Object.defineProperty(window, 'devToolsReportSoftNavs', {
      get: () => false,
      set: () => {},
      configurable: true,
      enumerable: true,
    });
  } catch {}

  try {
    const w = window as unknown as { __chromium_devtools_kill_live_metrics?: () => void };
    if (typeof w.__chromium_devtools_kill_live_metrics === 'function') {
      w.__chromium_devtools_kill_live_metrics();
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  applyBrowserStabilityGuards();
}

/**
 * Register Service Worker safely for PWA support.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;

  applyBrowserStabilityGuards();

  if ('serviceWorker' in navigator) {
    const handleLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[SW] Registered successfully scope:', registration.scope);
          registration.update().catch(() => {});
        })
        .catch((err) => {
          console.warn('[SW] Registration failed:', err);
        });
    };

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad, { once: true });
    }
  }
}

