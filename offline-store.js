// Minimal IndexedDB wrapper for offline manga content. iOS Safari has no File
// System Access API (no real "choose a folder" picker), so this is the actual
// mechanism behind "download for offline reading" on iPhone — IndexedDB blobs,
// not files on disk.
const DB_NAME = 'hakufu-offline';
const DB_VERSION = 2;
const STORE = 'mangas';
const SETTINGS_STORE = 'settings'; // clave/valor sencillo — hoy solo el fondo de pantalla

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withSettingsStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, mode);
    const store = tx.objectStore(SETTINGS_STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
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

// ── Fondo de pantalla personalizado ─────────────────────────────────────
// Se guarda como blob en IndexedDB (no hay campo para esto en el backend,
// y así no depende de red) y se aplica con muchísima opacidad — se nota
// que está, pero no compite con el contenido ni pesa en el rendimiento.

export async function saveBackground(blob) {
  await withSettingsStore('readwrite', (store) => store.put({ key: 'background', blob }));
}

export async function getBackground() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const req = tx.objectStore(SETTINGS_STORE).get('background');
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => reject(req.error);
  });
}

export async function removeBackground() {
  await withSettingsStore('readwrite', (store) => store.delete('background'));
}

let currentBackgroundUrl = null;

// La llama webapp.js una vez al arrancar, y settings.js cada vez que el
// usuario cambia o quita el fondo.
export async function applyBackground() {
  const el = document.getElementById('app-background');
  if (!el) return;

  if (currentBackgroundUrl) {
    URL.revokeObjectURL(currentBackgroundUrl);
    currentBackgroundUrl = null;
  }

  const blob = await getBackground().catch(() => null);
  if (!blob) {
    el.style.backgroundImage = 'none';
    return;
  }

  currentBackgroundUrl = URL.createObjectURL(blob);
  el.style.backgroundImage = `url("${currentBackgroundUrl}")`;
}
