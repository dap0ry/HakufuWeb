import { openDb } from './offline-store.js';

// Biblioteca local del propio móvil — separada de la biblioteca sincronizada
// por Dropbox (esa la gestiona api.getLibrary()/offline-store.js "mangas").
// Todo lo de aquí vive solo en este dispositivo: crear una colección o subir
// un manga desde el móvil nunca toca la red ni el backend.
const MANGAS_STORE      = 'localMangas';
const COLLECTIONS_STORE = 'localCollections';

function newId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

async function withStore(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

function getAll(storeName) {
  return withStore(storeName, 'readonly', (store) =>
    new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    })
  );
}

// ── Mangas locales ──────────────────────────────────────────────────────

// title, fileBlob (el PDF/CBZ real), mimeType, coverBlob (miniatura ya
// extraída, o null si no se pudo generar).
export async function addLocalManga({ title, fileBlob, mimeType, coverBlob }) {
  const id = newId();
  await withStore(MANGAS_STORE, 'readwrite', (store) =>
    store.put({ id, title, fileBlob, mimeType, coverBlob: coverBlob || null, addedAt: Date.now() })
  );
  return id;
}

export async function getLocalManga(id) {
  return withStore(MANGAS_STORE, 'readonly', (store) =>
    new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    })
  );
}

export function listLocalMangas() {
  return getAll(MANGAS_STORE);
}

export async function removeLocalManga(id) {
  await withStore(MANGAS_STORE, 'readwrite', (store) => store.delete(id));
  // Quitarlo también de cualquier colección que lo tuviera — si no, queda
  // un id fantasma que ya no existe en ningún sitio.
  const collections = await listLocalCollections();
  for (const col of collections) {
    if (!col.mangaIds.includes(id)) continue;
    col.mangaIds = col.mangaIds.filter((m) => m !== id);
    await withStore(COLLECTIONS_STORE, 'readwrite', (store) => store.put(col));
  }
}

// ── Colecciones locales ─────────────────────────────────────────────────

export async function createLocalCollection(name) {
  const id = newId();
  await withStore(COLLECTIONS_STORE, 'readwrite', (store) =>
    store.put({ id, name, mangaIds: [], createdAt: Date.now() })
  );
  return id;
}

export function listLocalCollections() {
  return getAll(COLLECTIONS_STORE);
}

export async function getLocalCollection(id) {
  return withStore(COLLECTIONS_STORE, 'readonly', (store) =>
    new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    })
  );
}

export async function removeLocalCollection(id) {
  // Solo borra la colección — los mangas que tuviera dentro se quedan,
  // pasan a "sin colección" (igual que en la app de escritorio).
  await withStore(COLLECTIONS_STORE, 'readwrite', (store) => store.delete(id));
}

export async function addMangaToCollection(collectionId, mangaId) {
  await withStore(COLLECTIONS_STORE, 'readwrite', (store) =>
    new Promise((resolve, reject) => {
      const req = store.get(collectionId);
      req.onsuccess = () => {
        const col = req.result;
        if (!col) { resolve(); return; }
        if (!col.mangaIds.includes(mangaId)) col.mangaIds.push(mangaId);
        store.put(col);
        resolve();
      };
      req.onerror = () => reject(req.error);
    })
  );
}
