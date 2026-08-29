/**
 * Safe Storage Wrapper for WebKit / Safari / iOS Compatibility.
 * Prevents DOMException / SecurityError when localStorage or cookies are restricted
 * in Safari Private Browsing Mode or ITP (Intelligent Tracking Prevention).
 */

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memoryFallback = new MemoryStorage();

function isStorageSupported(type: 'localStorage' | 'sessionStorage'): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const storage = window[type];
    const testKey = '__safari_test_key__';
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export const safeLocalStorage: Storage = {
  get length(): number {
    if (isStorageSupported('localStorage')) {
      try {
        return window.localStorage.length;
      } catch {
        return memoryFallback.length;
      }
    }
    return memoryFallback.length;
  },

  clear(): void {
    if (isStorageSupported('localStorage')) {
      try {
        window.localStorage.clear();
      } catch {
        memoryFallback.clear();
      }
    } else {
      memoryFallback.clear();
    }
  },

  getItem(key: string): string | null {
    if (isStorageSupported('localStorage')) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memoryFallback.getItem(key);
      }
    }
    return memoryFallback.getItem(key);
  },

  key(index: number): string | null {
    if (isStorageSupported('localStorage')) {
      try {
        return window.localStorage.key(index);
      } catch {
        return memoryFallback.key(index);
      }
    }
    return memoryFallback.key(index);
  },

  removeItem(key: string): void {
    if (isStorageSupported('localStorage')) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        memoryFallback.removeItem(key);
      }
    } else {
      memoryFallback.removeItem(key);
    }
  },

  setItem(key: string, value: string): void {
    if (isStorageSupported('localStorage')) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch {
        memoryFallback.setItem(key, value);
      }
    } else {
      memoryFallback.setItem(key, value);
    }
  },
};

/**
 * Safe Cookie Writer with WebKit / Safari iOS Lax / Secure parameters.
 */
export function setSecureCookie(name: string, value: string, maxAgeSeconds: number = 2592000): void {
  if (typeof document === 'undefined') return;
  try {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const secureFlag = isHttps ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${secureFlag}`;
  } catch (err) {
    console.warn('[SafeStorage] Could not set cookie:', err);
  }
}

/**
 * Safe Cookie Eraser for Safari / iOS.
 */
export function removeSecureCookie(name: string): void {
  if (typeof document === 'undefined') return;
  try {
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const secureFlag = isHttps ? '; Secure' : '';
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secureFlag}`;
  } catch (err) {
    console.warn('[SafeStorage] Could not remove cookie:', err);
  }
}
