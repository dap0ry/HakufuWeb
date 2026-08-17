import { api, isLoggedIn, setSession, clearSession, getUsername } from './api.js';
import { listOfflineIds, saveOffline, applyBackground } from './offline-store.js';
import {
  listLocalMangas, addLocalManga, removeLocalManga, getLocalManga,
  listLocalCollections, getLocalCollection, createLocalCollection, removeLocalCollection, addMangaToCollection,
  updateLocalMangaCover,
} from './local-library.js';
import { extractCover } from './cover-extract.js';
import { downloadFromDropbox } from './dropbox-content.js';

const marketing = document.getElementById('marketing');
const webapp = document.getElementById('webapp');
const accountBox = document.getElementById('account-box');

// ── Cuenta (login / registro / sesión) — vive dentro de la portada ────────
let authMode = 'login'; // 'login' | 'register'

function renderAccountBox() {
  if (isLoggedIn()) {
    accountBox.innerHTML = `
      <h4>Tu cuenta</h4>
      <div class="account-session">
        <p>Sesión iniciada como <strong>${escapeHtml(getUsername() || '')}</strong>.</p>
        <div class="row">
          <button class="btn" id="goto-app-btn">Ir a tu biblioteca</button>
          <button class="btn-ghost" id="logout-btn" style="padding:11px 16px;">Cerrar sesión</button>
        </div>
      </div>
    `;
    accountBox.querySelector('#goto-app-btn').addEventListener('click', () => navigate('/library'));
    accountBox.querySelector('#logout-btn').addEventListener('click', () => {
      clearSession();
      renderAccountBox();
    });
    return;
  }

  const isRegister = authMode === 'register';
  accountBox.innerHTML = `
    <h4>${isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</h4>
    <form id="auth-form">
      <div class="field">
        <label>Usuario</label>
        <input type="text" name="username" required autocomplete="username">
      </div>
      ${isRegister ? `
      <div class="field">
        <label>Email</label>
        <input type="email" name="email" required autocomplete="email">
      </div>` : ''}
      <div class="field">
        <label>Contraseña</label>
        <input type="password" name="password" required autocomplete="${isRegister ? 'new-password' : 'current-password'}">
      </div>
      ${isRegister ? `
      <div class="field">
        <label>Confirmar contraseña</label>
        <input type="password" name="password_confirm" required autocomplete="new-password">
      </div>` : ''}
      <button type="submit" class="btn" style="width:100%;">${isRegister ? 'Crear cuenta' : 'Entrar'}</button>
      <div class="account-error" id="account-error"></div>
    </form>
    <div class="account-switch">
      ${isRegister
        ? `¿Ya tienes cuenta? <button id="switch-link">Inicia sesión</button>`
        : `¿No tienes cuenta? <button id="switch-link">Regístrate</button>`}
      · para leer tu biblioteca y respaldarla en Dropbox.
    </div>
  `;

  accountBox.querySelector('#switch-link').addEventListener('click', () => {
    authMode = isRegister ? 'login' : 'register';
    renderAccountBox();
  });

  accountBox.querySelector('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = accountBox.querySelector('#account-error');
    errorEl.textContent = '';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const result = isRegister
        ? await api.register(form.get('username'), form.get('email'), form.get('password'), form.get('password_confirm'))
        : await api.login(form.get('username'), form.get('password'));
      setSession(result.access_token, result.username);
      navigate('/library');
    } catch (err) {
      errorEl.textContent = err.message;
      submitBtn.disabled = false;
    }
  });
}

// ── Router: decide portada vs. app dentro de la misma página ──────────────
function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, param] = hash.split('/');
  return { name, param };
}

function navigate(path) { location.hash = path; }

const APP_ROUTES = new Set(['library', 'account', 'settings', 'friends', 'read', 'local-collection']);

// Añadida a la pantalla de inicio (Compartir → Añadir a pantalla de inicio
// en iPhone, o el equivalente de escritorio/Android) — la portada de
// marketing/descarga no debe verse nunca desde ahí.
function isStandalone() {
  return window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
}

async function render() {
  const { name, param } = currentRoute();
  const wantsApp = APP_ROUTES.has(name);

  if (isStandalone() && isLoggedIn() && !wantsApp) {
    navigate('/library');
    return; // el cambio de hash relanza render() con la ruta ya correcta
  }

  renderAccountBox();

  if (!isLoggedIn() || !wantsApp) {
    marketing.style.display = '';
    webapp.style.display = 'none';
    return;
  }

  marketing.style.display = 'none';
  webapp.style.display = 'flex';
  webapp.innerHTML = '';

  if (name === 'read' && param) {
    const { renderReader } = await import('./reader.js');
    renderReader(webapp, param);
    return;
  }

  webapp.appendChild(titlebar());
  const page = document.createElement('div');
  page.className = 'page';
  webapp.appendChild(page);
  // Una colección local abierta es una sub-pantalla de Biblioteca — la
  // pestaña activa de abajo debe seguir marcando "Biblioteca".
  webapp.appendChild(tabbar(name === 'local-collection' ? 'library' : name));

  page.innerHTML = '<div class="empty-state">Cargando…</div>';

  if (name === 'account') {
    const { renderAccount } = await import('./account.js');
    renderAccount(page);
  } else if (name === 'settings') {
    const { renderSettings } = await import('./settings.js');
    renderSettings(page);
  } else if (name === 'friends') {
    const { renderFriends } = await import('./friends.js');
    renderFriends(page);
  } else if (name === 'local-collection' && param) {
    renderLocalCollectionDetail(page, param);
  } else {
    renderLibrary(page);
  }
}

// Barra superior: solo marca, sin navegación — la navegación real vive en
// la barra inferior (tabbar), como en una app móvil de verdad.
function titlebar() {
  const bar = document.createElement('div');
  bar.className = 'topbar';
  bar.innerHTML = '<span class="brand">HAKUFU</span>';
  return bar;
}

// Iconos de línea, hechos con formas simples (circle/line/rect/un solo arco)
// a propósito — nada de paths complejos a mano, que es fácil que salgan mal
// sin poder verlos renderizados antes de publicar.
const TAB_ICONS = {
  library: `
    <line x1="3" y1="19.5" x2="19" y2="19.5"/>
    <rect x="4" y="10" width="3" height="9.5" rx="0.6"/>
    <rect x="9" y="6" width="3" height="13.5" rx="0.6"/>
    <rect x="14" y="9" width="3" height="10.5" rx="0.6"/>
  `,
  account: `
    <circle cx="12" cy="8" r="3.5"/>
    <path d="M5 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/>
  `,
  settings: `
    <line x1="4" y1="7" x2="20" y2="7"/><circle cx="14" cy="7" r="1.8"/>
    <line x1="4" y1="12" x2="20" y2="12"/><circle cx="9" cy="12" r="1.8"/>
    <line x1="4" y1="17" x2="20" y2="17"/><circle cx="16" cy="17" r="1.8"/>
  `,
  friends: `
    <circle cx="8.5" cy="9" r="3"/>
    <path d="M2.5 19.5c0-3.6 2.6-6 6-6s6 2.4 6 6"/>
    <circle cx="17" cy="9.5" r="2.3"/>
    <path d="M13.5 19.5c0-3 2-5 4.5-5"/>
  `,
};

const TABS = [
  { route: 'library',  label: 'Biblioteca' },
  { route: 'friends',  label: 'Amigos' },
  { route: 'account',  label: 'Cuenta' },
  { route: 'settings', label: 'Configuración' },
];

function tabbar(active) {
  const bar = document.createElement('nav');
  bar.className = 'tabbar';
  bar.innerHTML = TABS.map((t) => `
    <a href="#/${t.route}" class="tabbar-item ${active === t.route ? 'active' : ''}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
           stroke-linecap="round" stroke-linejoin="round">${TAB_ICONS[t.route]}</svg>
      ${t.label}
    </a>
  `).join('');
  return bar;
}

const UNCATEGORIZED_LABEL = 'Sin colección';

async function renderLibrary(container) {
  container.innerHTML = '<h2>Biblioteca</h2><div class="empty-state">Cargando…</div>';

  let data;
  try {
    data = await api.getLibrary();
  } catch {
    data = null; // sin nada respaldado en Dropbox todavía — no es un error fatal,
                 // la biblioteca local (de este móvil) puede seguir mostrándose
  }

  const mangas = (data && data.mangas) || [];
  const collections = (data && data.collections) || [];

  container.innerHTML = '';
  container.appendChild(renderLibraryHeader(container));

  let hadContent = false;

  if (mangas.length > 0) {
    hadContent = true;
    const byId = new Map(mangas.map((m) => [m.id, m]));
    const grouped = new Set();
    const offlineIds = new Set(await listOfflineIds().catch(() => []));

    // Mismo agrupado que la carpeta de Dropbox: una sección por colección, con
    // los mangas sueltos al final bajo "Sin colección" — así la biblioteca
    // web se ve igual que como queda organizado el respaldo.
    for (const col of collections) {
      const items = (col.manga_ids || []).map((id) => byId.get(id)).filter(Boolean);
      if (items.length === 0) continue;
      items.forEach((m) => grouped.add(m.id));
      container.appendChild(renderMangaSection(col.name || UNCATEGORIZED_LABEL, items, offlineIds));
    }

    const loose = mangas.filter((m) => !grouped.has(m.id));
    if (loose.length > 0) {
      container.appendChild(renderMangaSection(UNCATEGORIZED_LABEL, loose, offlineIds));
    }
  }

  // ── Biblioteca local (creada desde este móvil, nunca sale de aquí) ──────
  const localMangas = await listLocalMangas().catch(() => []);
  const localCollections = await listLocalCollections().catch(() => []);
  backfillMissingCovers(localMangas, () => renderLibrary(container));

  if (localMangas.length > 0 || localCollections.length > 0) {
    hadContent = true;
    const heading = document.createElement('h3');
    heading.textContent = 'En este dispositivo';
    heading.style.cssText = 'font-size:11px;color:var(--muted);margin:24px 0 12px;text-transform:uppercase;letter-spacing:1px;';
    container.appendChild(heading);

    const byId = new Map(localMangas.map((m) => [m.id, m]));
    const grouped = new Set();
    localCollections.forEach((col) => col.mangaIds.forEach((id) => byId.has(id) && grouped.add(id)));

    // Las colecciones se ven como carpetas (igual que en la app de
    // escritorio) — clicar entra en su propia pantalla, y ahí es donde se
    // añaden mangas directamente a esa colección.
    if (localCollections.length > 0) {
      container.appendChild(renderLocalCollectionFolders(localCollections, byId));
    }

    const loose = localMangas.filter((m) => !grouped.has(m.id));
    if (loose.length > 0 || localCollections.length === 0) {
      container.appendChild(renderLocalMangaSection(container, UNCATEGORIZED_LABEL, loose));
    }
  }

  if (!hadContent) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Aún no hay nada aquí. Sube una copia de seguridad desde la app de escritorio, o añade un manga directamente desde arriba.';
    container.appendChild(empty);
  }
}

// Botones de "Nueva colección" / "Añadir manga" — todo lo que crean se
// queda en este dispositivo, nunca se sube a ningún sitio.
function renderLibraryHeader(pageContainer) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
  wrap.innerHTML = `
    <h2 style="margin-bottom:0;">Biblioteca</h2>
    <div style="display:flex;gap:8px;">
      <button class="btn-ghost" id="new-collection-btn" style="padding:9px 14px;font-size:12px;">+ Colección</button>
      <button class="btn" id="add-manga-btn" style="padding:9px 14px;font-size:12px;">+ Manga</button>
      <!-- Sin accept=".cbr,..." a propósito: iOS no tiene un UTI registrado
           para .cbr, así que el selector de Archivos los muestra en gris
           (no seleccionables) en cuanto se lo restringes por tipo. Se valida
           el formato después, ya con el archivo elegido, en addMangaFlow. -->
      <input type="file" id="add-manga-input" style="display:none;">
    </div>
  `;

  wrap.querySelector('#new-collection-btn').addEventListener('click', async () => {
    const name = prompt('Nombre de la nueva colección:');
    if (!name || !name.trim()) return;
    await createLocalCollection(name.trim());
    renderLibrary(pageContainer);
  });

  const fileInput = wrap.querySelector('#add-manga-input');
  wrap.querySelector('#add-manga-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (file) await addMangaFlow(file, null, () => renderLibrary(pageContainer));
  });

  return wrap;
}

// Rellena en segundo plano la portada de mangas locales que se guardaron sin
// una — el caso típico es un CBR añadido antes de que existiera fromCbr()
// (llegó en un commit posterior a cuando se permitió añadir CBR). No hace
// falta re-añadir el manga: se reintenta la extracción con el archivo que
// ya está guardado, y si sale algo se persiste y se avisa para repintar.
function backfillMissingCovers(mangas, onCoverFound) {
  const pending = mangas.filter((m) => !m.coverBlob && m.fileBlob);
  if (pending.length === 0) return;

  Promise.all(pending.map(async (manga) => {
    const coverBlob = await extractCover(manga.fileBlob, manga.mimeType).catch(() => null);
    if (coverBlob) await updateLocalMangaCover(manga.id, coverBlob);
    return !!coverBlob;
  })).then((found) => {
    if (found.some(Boolean)) onCoverFound();
  });
}

// Sube un manga (PDF, CBZ o CBR) desde el propio móvil: extrae portada, pide
// título y, si quieres, en qué colección local va. Todo se queda en
// IndexedDB de este dispositivo.
//
// presetCollectionId: si se llama desde dentro de una colección (carpeta) ya
// abierta, se añade directamente ahí sin preguntar — igual que en la app de
// escritorio. Si se llama desde la Biblioteca general (undefined), pregunta
// a qué colección va, si hay alguna creada.
//
// onDone: qué hacer al terminar (repintar la página que corresponda —
// Biblioteca o la propia colección — cada llamante sabe la suya).
async function addMangaFlow(file, presetCollectionId, onDone) {
  // file.type suele venir vacío para .cbr (el navegador no reconoce la
  // extensión) — antes esto hacía que un CBR se etiquetase como CBZ por
  // error. Se detecta siempre por extensión primero.
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['pdf', 'cbz', 'cbr'].includes(ext)) {
    alert('Solo se pueden añadir PDF, CBZ o CBR desde el navegador.');
    return;
  }

  const mimeType = ext === 'pdf' ? 'application/pdf'
    : ext === 'cbz' ? 'application/zip'
    : 'application/vnd.rar'; // cbr

  const defaultTitle = file.name.replace(/\.[^.]+$/, '');
  const title = prompt('Título del manga:', defaultTitle);
  if (title === null) return; // cancelado

  let collectionId = presetCollectionId || null;
  if (!presetCollectionId) {
    const collections = await listLocalCollections().catch(() => []);
    if (collections.length > 0) {
      const names = collections.map((c) => c.name).join(', ');
      const chosen = prompt(
        `¿A qué colección lo añades? (escribe el nombre exacto, o deja en blanco para "Sin colección")\n\nColecciones: ${names}`,
        ''
      );
      if (chosen && chosen.trim()) {
        const match = collections.find((c) => c.name.toLowerCase() === chosen.trim().toLowerCase());
        if (match) collectionId = match.id;
      }
    }
  }

  const coverBlob = await extractCover(file, mimeType);
  const id = await addLocalManga({ title: title.trim() || defaultTitle, fileBlob: file, mimeType, coverBlob });
  if (collectionId) await addMangaToCollection(collectionId, id);

  onDone();
}

function renderMangaSection(title, mangas, offlineIds = new Set()) {
  const section = document.createElement('div');
  section.style.marginBottom = '32px';

  const heading = document.createElement('h3');
  heading.textContent = title;
  heading.style.cssText = 'font-size:13px;color:var(--secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;';
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'grid';

  for (const manga of mangas) {
    const isOffline = offlineIds.has(manga.id);
    const card = document.createElement('div');
    card.className = 'manga-card';
    card.innerHTML = `
      <div class="manga-cover ${isOffline ? '' : 'manga-cover-locked'}">
        ${manga.cover_cloudinary_url
          ? `<img src="${manga.cover_cloudinary_url}" alt="" loading="lazy">`
          : escapeHtml(manga.title || 'Sin portada')}
        <div class="manga-progress" style="display:none;"><div class="manga-progress-fill"></div></div>
      </div>
      <div class="manga-title">${escapeHtml(manga.title || 'Sin título')}</div>
      <span class="manga-badge manga-status">${mangaStatusLabel(manga, isOffline)}</span>
    `;
    card.addEventListener('click', () => {
      if (!manga.dropbox_path) return; // no respaldado — nada que hacer aquí
      if (isOffline) { navigate(`/read/${manga.id}`); return; }
      downloadManga(manga, card);
    });
    grid.appendChild(card);
  }

  section.appendChild(grid);
  return section;
}

function mangaStatusLabel(manga, isOffline) {
  if (isOffline) return 'Offline ✓';
  if (manga.dropbox_path) return 'Toca para descargar';
  return 'No respaldado';
}

// Descarga un manga individual con progreso real (a partir de Content-Length)
// y lo guarda en la caché offline del dispositivo — no crea ficheros
// visibles en ningún sitio (Safari/iOS no lo permite), pero deja el manga
// disponible para leer sin conexión. Al terminar, abre el lector.
async function downloadManga(manga, card) {
  const progressWrap = card.querySelector('.manga-progress');
  const progressFill = card.querySelector('.manga-progress-fill');
  const statusEl = card.querySelector('.manga-status');

  progressWrap.style.display = 'block';
  statusEl.textContent = 'Descargando…';

  try {
    const { access_token } = await api.dropboxToken();
    const resp = await downloadFromDropbox(access_token, manga.dropbox_path);

    // Dropbox no manda Content-Type útil en /files/download — el propio
    // manga.dropbox_path ya trae la extensión, así que se deduce de ahí en
    // vez de confiar en la cabecera (a diferencia de Drive, que sí la daba).
    const ext = (manga.dropbox_path.split('.').pop() || '').toLowerCase();
    const contentType = ext === 'pdf' ? 'application/pdf'
      : (ext === 'cbz' || ext === 'zip') ? 'application/zip'
      : (ext === 'cbr' || ext === 'rar') ? 'application/vnd.rar'
      : 'application/octet-stream';
    const total = Number(resp.headers.get('Content-Length')) || 0;
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (total > 0) progressFill.style.width = `${Math.min(100, (received / total) * 100)}%`;
    }

    const blob = new Blob(chunks, { type: contentType });
    await saveOffline(manga.id, manga.title, blob, contentType);

    navigate(`/read/${manga.id}`);
  } catch (err) {
    progressWrap.style.display = 'none';
    statusEl.textContent = 'Toca para descargar';
    alert(`No se pudo descargar: ${err.message}`);
  }
}

// Sección de mangas locales sueltos (sin colección, creados desde este
// móvil): sin descarga, sin estado offline/online — ya están aquí.
function renderLocalMangaSection(pageContainer, title, mangas) {
  const section = document.createElement('div');
  section.style.marginBottom = '32px';

  const heading = document.createElement('h3');
  heading.textContent = title;
  heading.style.cssText = 'font-size:13px;color:var(--secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;';
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'grid';

  if (mangas.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.cssText = 'padding:16px;font-size:12px;';
    empty.textContent = 'Sin mangas todavía.';
    grid.appendChild(empty);
  }

  for (const manga of mangas) {
    grid.appendChild(renderLocalMangaCard(manga, () => renderLibrary(pageContainer)));
  }

  section.appendChild(grid);
  return section;
}

// Tarjeta de un manga local — igual en la Biblioteca (mangas sueltos) y
// dentro de una colección abierta; onChanged repinta lo que corresponda
// en cada sitio tras borrar.
function renderLocalMangaCard(manga, onChanged) {
  const coverUrl = manga.coverBlob ? URL.createObjectURL(manga.coverBlob) : null;
  const card = document.createElement('div');
  card.className = 'manga-card';
  card.innerHTML = `
    <div class="manga-cover">
      ${coverUrl ? `<img src="${coverUrl}" alt="" loading="lazy">` : escapeHtml(manga.title || 'Sin portada')}
    </div>
    <div class="manga-title">${escapeHtml(manga.title || 'Sin título')}</div>
    <button class="btn-ghost local-delete-btn" style="padding:4px 10px;font-size:11px;margin-top:6px;width:100%;">Borrar</button>
  `;
  card.addEventListener('click', () => navigate(`/read/${manga.id}`));
  card.querySelector('.local-delete-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`¿Borrar "${manga.title || 'este manga'}"? Esta acción no se puede deshacer.`)) return;
    await removeLocalManga(manga.id);
    onChanged();
  });
  return card;
}

// Cuadrícula de colecciones locales como carpetas — clicar entra en su
// propia pantalla (renderLocalCollectionDetail), igual que en la app de
// escritorio. Aquí solo se ven, no se pueden borrar ni añadir mangas
// directamente — eso vive dentro de cada carpeta.
function renderLocalCollectionFolders(collections, byId) {
  const section = document.createElement('div');
  section.style.marginBottom = '32px';

  const grid = document.createElement('div');
  grid.className = 'grid';

  for (const col of collections) {
    const items = col.mangaIds.map((id) => byId.get(id)).filter(Boolean);
    const card = document.createElement('div');
    card.className = 'manga-card';
    card.innerHTML = `
      <div class="manga-cover" style="overflow:visible;padding:0;">${stackedCoverHtml(items)}</div>
      <div class="manga-title">${escapeHtml(col.name)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px;">${items.length} manga${items.length === 1 ? '' : 's'}</div>
    `;
    card.addEventListener('click', () => navigate(`/local-collection/${col.id}`));
    grid.appendChild(card);
  }

  section.appendChild(grid);
  return section;
}

// Portada de una carpeta: hasta 3 mangas en abanico, uno detrás de otro con
// un poco de rotación — el mismo efecto 3D que ya tiene la app de
// escritorio para las colecciones, aquí en CSS puro (mismos ángulos y
// proporciones, solo que en % en vez de píxeles fijos por lo del grid
// responsive). Sin portadas disponibles, cae a la carpeta de siempre.
function stackedCoverHtml(mangas) {
  const covers = mangas.filter((m) => m.coverBlob).slice(0, 3).map((m) => URL.createObjectURL(m.coverBlob));
  if (covers.length === 0) {
    return `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:40px;">📁</div>`;
  }

  // covers[0] va delante (arriba del todo); si hay más, se abren en abanico
  // detrás hacia la izquierda, cada vez un poco más pequeñas y giradas.
  const layers = [];
  if (covers[2]) {
    layers.push(`<img src="${covers[2]}" style="position:absolute;inset:6%;width:88%;height:88%;object-fit:cover;
      border-radius:6px;border:1px solid var(--border);transform-origin:50% 100%;
      transform:rotate(-4deg) translate(8%,-6%);z-index:1;">`);
  }
  if (covers[1]) {
    layers.push(`<img src="${covers[1]}" style="position:absolute;inset:3%;width:93%;height:93%;object-fit:cover;
      border-radius:6px;border:1px solid var(--border);transform-origin:50% 100%;
      transform:rotate(-2deg) translate(4%,-3%);z-index:2;">`);
  }
  layers.push(`<img src="${covers[0]}" style="position:absolute;inset:1%;width:98%;height:98%;object-fit:cover;
    border-radius:6px;border:1px solid var(--border);z-index:3;box-shadow:0 4px 14px rgba(0,0,0,0.35);">`);

  return layers.join('');
}

// Dentro de una carpeta: nombre, botón para borrar la colección (los mangas
// de dentro no se borran, quedan sin colección) y "+ Manga" que añade
// directamente aquí, sin preguntar a qué colección va.
async function renderLocalCollectionDetail(container, collectionId) {
  container.innerHTML = '<div class="empty-state">Cargando…</div>';

  const col = await getLocalCollection(collectionId).catch(() => null);
  if (!col) {
    container.innerHTML = '<div class="empty-state">Esta colección ya no existe.</div>';
    return;
  }

  const allMangas = await listLocalMangas().catch(() => []);
  const byId = new Map(allMangas.map((m) => [m.id, m]));
  const items = col.mangaIds.map((id) => byId.get(id)).filter(Boolean);
  backfillMissingCovers(items, () => renderLocalCollectionDetail(container, collectionId));

  container.innerHTML = '';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:8px;flex-wrap:wrap;';
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;">
      <button class="btn-ghost" id="back-btn" style="padding:9px 14px;font-size:12px;">← Biblioteca</button>
      <h2 style="margin-bottom:0;">📁 ${escapeHtml(col.name)}</h2>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn-ghost" id="delete-collection-btn" style="padding:9px 14px;font-size:12px;">Borrar colección</button>
      <button class="btn" id="add-manga-btn" style="padding:9px 14px;font-size:12px;">+ Manga</button>
      <input type="file" id="add-manga-input" style="display:none;">
    </div>
  `;
  container.appendChild(header);

  header.querySelector('#back-btn').addEventListener('click', () => navigate('/library'));
  header.querySelector('#delete-collection-btn').addEventListener('click', async () => {
    if (!confirm(`¿Borrar la colección "${col.name}"? Los mangas de dentro no se borran, quedan sin colección.`)) return;
    await removeLocalCollection(collectionId);
    navigate('/library');
  });

  const fileInput = header.querySelector('#add-manga-input');
  header.querySelector('#add-manga-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (file) await addMangaFlow(file, collectionId, () => renderLocalCollectionDetail(container, collectionId));
  });

  const grid = document.createElement('div');
  grid.className = 'grid';

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Sin mangas todavía — añade uno con el botón de arriba.';
    grid.appendChild(empty);
  }

  for (const manga of items) {
    grid.appendChild(renderLocalMangaCard(manga, () => renderLocalCollectionDetail(container, collectionId)));
  }

  container.appendChild(grid);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function showFatalError(err) {
  console.error(err);
  accountBox.innerHTML = `
    <p style="color:var(--error);font-size:12px;">
      Algo falló: ${escapeHtml(err && err.message ? err.message : String(err))}
    </p>
  `;
}

function safeRender() { render().catch(showFatalError); }

window.addEventListener('hashchange', safeRender);
window.addEventListener('unhandledrejection', (e) => showFatalError(e.reason));
safeRender();
applyBackground().catch(() => {}); // fondo opcional (Configuración) — si no hay ninguno, no hace nada

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
