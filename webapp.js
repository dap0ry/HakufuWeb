import { api, isLoggedIn, setSession, clearSession, getUsername } from './api.js';

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

const APP_ROUTES = new Set(['library', 'backup', 'read']);

async function render() {
  renderAccountBox();

  const { name, param } = currentRoute();
  const wantsApp = APP_ROUTES.has(name);

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

  webapp.appendChild(topbar(name));
  const page = document.createElement('div');
  page.className = 'page';
  webapp.appendChild(page);

  if (name === 'backup') {
    page.innerHTML = '<div class="empty-state">Cargando…</div>';
    const { renderBackup } = await import('./backup.js');
    renderBackup(page);
  } else {
    renderLibrary(page);
  }
}

function topbar(active) {
  const bar = document.createElement('div');
  bar.className = 'topbar';
  bar.innerHTML = `
    <span class="brand">HAKUFU</span>
    <nav>
      <a href="#/library" class="${active === 'library' ? 'active' : ''}">Biblioteca</a>
      <a href="#/backup" class="${active === 'backup' ? 'active' : ''}">Copia de seguridad</a>
      <a href="#" id="home-link">← Portada</a>
      <a href="#" id="logout-link">Salir (${getUsername() || ''})</a>
    </nav>
  `;
  bar.querySelector('#home-link').addEventListener('click', (e) => { e.preventDefault(); navigate(''); });
  bar.querySelector('#logout-link').addEventListener('click', (e) => {
    e.preventDefault();
    clearSession();
    navigate('');
  });
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

  for (const col of collections) {
    const items = (col.manga_ids || [])
      .map((id) => byId.get(id))
      .filter(Boolean);
    if (items.length === 0) continue;
    items.forEach((m) => grouped.add(m.id));
    container.appendChild(renderMangaSection(col.name || UNCATEGORIZED_LABEL, items));
  }

  const loose = mangas.filter((m) => !grouped.has(m.id));
  if (loose.length > 0) {
    container.appendChild(renderMangaSection(UNCATEGORIZED_LABEL, loose));
  }
}

function renderMangaSection(title, mangas) {
  const section = document.createElement('div');
  section.style.marginBottom = '32px';

  const heading = document.createElement('h3');
  heading.textContent = title;
  heading.style.cssText = 'font-size:13px;color:var(--secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;';
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'grid';

  for (const manga of mangas) {
    const card = document.createElement('div');
    card.className = 'manga-card';
    card.innerHTML = `
      <div class="manga-cover">
        ${manga.cover_cloudinary_url
          ? `<img src="${manga.cover_cloudinary_url}" alt="" loading="lazy">`
          : escapeHtml(manga.title || 'Sin portada')}
      </div>
      <div class="manga-title">${escapeHtml(manga.title || 'Sin título')}</div>
      ${manga.drive_file_id
        ? '<span class="manga-badge">En Drive</span>'
        : '<span class="manga-badge">No respaldado</span>'}
    `;
    card.addEventListener('click', () => {
      if (!manga.drive_file_id) return;
      navigate(`/read/${manga.id}`);
    });
    grid.appendChild(card);
  }

  section.appendChild(grid);
  return section;
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
