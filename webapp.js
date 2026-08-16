import { api, isLoggedIn, setSession, clearSession, getUsername } from './api.js';
import { listOfflineIds, saveOffline } from './offline-store.js';

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
      · para leer tu biblioteca y respaldarla en Google Drive.
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

const APP_ROUTES = new Set(['library', 'account', 'settings', 'friends', 'read']);

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
  webapp.appendChild(tabbar(name));

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
  { route: 'account',  label: 'Cuenta' },
  { route: 'settings', label: 'Configuración' },
  { route: 'friends',  label: 'Amigos' },
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
  } catch (err) {
    container.innerHTML = `<h2>Biblioteca</h2><div class="empty-state">Error: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const mangas = (data && data.mangas) || [];
  const collections = (data && data.collections) || [];
  container.innerHTML = '<h2>Biblioteca</h2>';

  if (mangas.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Aún no hay nada aquí. Sube una copia de seguridad desde la app de escritorio.';
    container.appendChild(empty);
    return;
  }

  // Mismo agrupado que la carpeta de Drive: una sección por colección, con
  // los mangas sueltos al final bajo "Sin colección" — así la biblioteca web
  // se ve igual que como queda organizado el respaldo.
  const byId = new Map(mangas.map((m) => [m.id, m]));
  const grouped = new Set();
  const offlineIds = new Set(await listOfflineIds().catch(() => []));

  for (const col of collections) {
    const items = (col.manga_ids || [])
      .map((id) => byId.get(id))
      .filter(Boolean);
    if (items.length === 0) continue;
    items.forEach((m) => grouped.add(m.id));
    container.appendChild(renderMangaSection(col.name || UNCATEGORIZED_LABEL, items, offlineIds));
  }

  const loose = mangas.filter((m) => !grouped.has(m.id));
  if (loose.length > 0) {
    container.appendChild(renderMangaSection(UNCATEGORIZED_LABEL, loose, offlineIds));
  }
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
      if (!manga.drive_file_id) return; // no respaldado — nada que hacer aquí
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
  if (manga.drive_file_id) return 'Toca para descargar';
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
    const { access_token } = await api.driveToken();
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${manga.drive_file_id}?alt=media`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const contentType = resp.headers.get('Content-Type') || 'application/octet-stream';
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
