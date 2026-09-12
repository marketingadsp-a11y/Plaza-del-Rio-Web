import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import firebaseConfigJson from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let dbInstance: Firestore | null = null;
let currentDbId: string | null = null;

/**
 * Gets the Firestore database instance.
 * Allows switching databases dynamically (e.g. between standard and (default)).
 */
export function getDb(customDbId?: string): Firestore {
  const storedDbId = localStorage.getItem('plaza_del_rio_db_id');
  
  // Use custom if provided, otherwise check stored, otherwise check config, fallback to '(default)'
  let targetDbId = '(default)';
  if (customDbId !== undefined) {
    targetDbId = customDbId;
  } else if (storedDbId !== null) {
    targetDbId = storedDbId;
  } else if (firebaseConfigJson.firestoreDatabaseId) {
    targetDbId = firebaseConfigJson.firestoreDatabaseId;
  }

  if (!dbInstance || currentDbId !== targetDbId) {
    currentDbId = targetDbId;
    if (targetDbId === '(default)' || targetDbId === '') {
      dbInstance = getFirestore(app);
    } else {
      dbInstance = getFirestore(app, targetDbId);
    }
    console.log(`[Firebase] Initialized Firestore with Database ID: ${targetDbId}`);
  }
  return dbInstance;
}

export function setPreferredDbId(dbId: string) {
  localStorage.setItem('plaza_del_rio_db_id', dbId);
  // Clear cached instance so it gets re-initialized on next getDb()
  dbInstance = null;
  currentDbId = null;
}

export function getPreferredDbId(): string {
  const storedDbId = localStorage.getItem('plaza_del_rio_db_id');
  if (storedDbId !== null) return storedDbId;
  return firebaseConfigJson.firestoreDatabaseId || '(default)';
}

export function getDefaultConfigDbId(): string {
  return firebaseConfigJson.firestoreDatabaseId || '(default)';
}

/**
 * Helper to calculate SHA-256 hash in browser
 */
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
