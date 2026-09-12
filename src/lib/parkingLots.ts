import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getDb } from './firebase';

export interface ParkingLotInfo {
  id: number;
  name: string;
  fieldName: string; // e.g., "parkingLot1Name"
}

/**
 * Extracts and deduplicates parking lots from settings/global data,
 * parsing keys like parkingLot1Name, parkingLot2Name, etc.
 */
export function extractParkingLots(
  globalData: Record<string, any> = {},
  extraIds: (number | undefined | null)[] = []
): ParkingLotInfo[] {
  const lotMap = new Map<number, string>();

  // Base defaults for lot 1 and lot 2
  lotMap.set(1, globalData.parkingLot1Name || 'Estacionamiento 1');
  lotMap.set(2, globalData.parkingLot2Name || 'Estacionamiento 2');

  // Parse all parkingLot{N}Name in globalData
  Object.keys(globalData).forEach((key) => {
    const match = key.match(/^parkingLot(\d+)Name$/i);
    if (match) {
      const id = parseInt(match[1], 10);
      if (!isNaN(id) && id > 0) {
        const val = globalData[key];
        if (typeof val === 'string' && val.trim()) {
          lotMap.set(id, val.trim());
        } else if (!lotMap.has(id)) {
          lotMap.set(id, `Estacionamiento ${id}`);
        }
      }
    }
  });

  // Include any extra known IDs (e.g. from existing users or rates)
  extraIds.forEach((id) => {
    if (id && typeof id === 'number' && id > 0 && !lotMap.has(id)) {
      const customName = globalData[`parkingLot${id}Name`];
      lotMap.set(id, customName && typeof customName === 'string' && customName.trim() 
        ? customName.trim() 
        : `Estacionamiento ${id}`);
    }
  });

  return Array.from(lotMap.entries())
    .map(([id, name]) => ({
      id,
      name,
      fieldName: `parkingLot${id}Name`
    }))
    .sort((a, b) => a.id - b.id);
}

/**
 * React hook to subscribe in real-time to settings/global and provide parking lot details.
 */
export function useParkingLots(extraIds: (number | undefined | null)[] = []) {
  const [globalSettings, setGlobalSettings] = useState<Record<string, any>>({});
  const [parkingLots, setParkingLots] = useState<ParkingLotInfo[]>(() => extractParkingLots({}, extraIds));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getDb();
    const docRef = doc(db, 'settings', 'global');

    const unsub = onSnapshot(docRef, (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setGlobalSettings(data);
      setParkingLots(extractParkingLots(data, extraIds));
      setLoading(false);
    }, (err) => {
      console.warn('Could not read settings/global:', err);
      setParkingLots(extractParkingLots({}, extraIds));
      setLoading(false);
    });

    return unsub;
  }, [JSON.stringify(extraIds)]);

  /**
   * Save or update parking lot names directly into settings/global
   */
  const saveParkingLotNames = async (updates: Record<string, string>) => {
    const db = getDb();
    const docRef = doc(db, 'settings', 'global');
    await setDoc(docRef, updates, { merge: true });
  };

  /**
   * Returns the display name for a parking lot by ID.
   */
  const getLotName = (id?: number | null): string => {
    if (id === undefined || id === null || id === 0) return 'Sin asignar';
    const found = parkingLots.find((p) => p.id === id);
    return found ? found.name : `Estacionamiento ${id}`;
  };

  return {
    globalSettings,
    parkingLots,
    loading,
    getLotName,
    saveParkingLotNames
  };
}
