import { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { getDb } from './firebase';
import { TicketConfig } from '../types';

const DEFAULT_LOGO = '/logo-plaza-1.jpg';
const STORAGE_KEY = 'plaza_del_rio_logo_url';

let cachedLogoUrl: string = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LOGO;
  } catch {
    return DEFAULT_LOGO;
  }
})();

const listeners = new Set<(logo: string) => void>();

function notifyListeners(url: string) {
  cachedLogoUrl = url;
  try {
    localStorage.setItem(STORAGE_KEY, url);
  } catch {
    // ignore localstorage errors
  }
  listeners.forEach(fn => fn(url));
}

/**
 * Hook to retrieve and react to the globally configured logo URL.
 * Automatically synchronizes with Firestore in real-time.
 */
export function useAppLogo() {
  const [logoUrl, setLogoUrl] = useState<string>(cachedLogoUrl);

  useEffect(() => {
    listeners.add(setLogoUrl);

    const db = getDb();
    const unsub = onSnapshot(doc(db, 'ticket_config', 'config'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as TicketConfig & { logoUrl?: string };
        const url = (data.logoUrl || '').trim();
        const effectiveLogo = url ? url : DEFAULT_LOGO;
        if (effectiveLogo !== cachedLogoUrl) {
          notifyListeners(effectiveLogo);
        }
      }
    }, (err) => {
      console.warn('[useAppLogo] Error reading logo from Firestore:', err);
    });

    return () => {
      listeners.delete(setLogoUrl);
      unsub();
    };
  }, []);

  const saveLogoUrl = async (newUrl: string) => {
    const trimmed = newUrl.trim();
    const effective = trimmed || DEFAULT_LOGO;
    notifyListeners(effective);

    const db = getDb();
    try {
      await setDoc(doc(db, 'ticket_config', 'config'), { logoUrl: trimmed }, { merge: true });
    } catch (err) {
      console.error('[useAppLogo] Error saving logoUrl to Firestore:', err);
      throw err;
    }
  };

  return {
    logoUrl,
    defaultLogo: DEFAULT_LOGO,
    saveLogoUrl,
  };
}

/**
 * Static getter for components or non-hook contexts
 */
export function getAppLogo(): string {
  return cachedLogoUrl;
}
