// Minimal IndexedDB wrapper for offline manga content. iOS Safari has no File
// System Access API (no real "choose a folder" picker), so this is the actual
// mechanism behind "download for offline reading" on iPhone — IndexedDB blobs,
// not files on disk.
const DB_NAME = 'hakufu-offline';
const DB_VERSION = 1;
const STORE = 'mangas';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveOffline(id, title, blob, mimeType) {
  await withStore('readwrite', (store) => store.put({ id, title, blob, mimeType, savedAt: Date.now() }));
}

export async function getOffline(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listOfflineIds() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeOffline(id) {
  await withStore('readwrite', (store) => store.delete(id));
}

export async function offlineStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}
