import { api, isLoggedIn, setSession, clearSession, getUsername } from './api.js';
import { renderBackup } from './backup.js';
import { renderReader } from './reader.js';

const root = document.getElementById('root');

// ── Router ──────────────────────────────────────────────────────────────
function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, param] = hash.split('/');
  return { name: name || (isLoggedIn() ? 'library' : 'login'), param };
}

function navigate(path) { location.hash = path; }

async function render() {
  if (!isLoggedIn()) {
    renderAuth(root);
    return;
  }

  const { name, param } = currentRoute();
  if (name === 'login' || name === 'register') { navigate('/library'); return; }

  root.innerHTML = '';
  root.appendChild(topbar(name));

  const page = document.createElement('div');
  page.className = 'page';
  root.appendChild(page);

  if (name === 'backup') {
    renderBackup(page);
  } else if (name === 'read' && param) {
    root.removeChild(page);
    renderReader(root, param);
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
      <a href="#" id="logout-link">Salir (${getUsername() || ''})</a>
    </nav>
  `;
  bar.querySelector('#logout-link').addEventListener('click', (e) => {
    e.preventDefault();
    clearSession();
    navigate('/login');
    render();
  });
  return bar;
}

// ── Auth (login / register) ────────────────────────────────────────────
function renderAuth(container) {
  const { name } = currentRoute();
  const isRegister = name === 'register';

  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'auth-wrap';

  const card = document.createElement('div');
  card.className = 'auth-card';
  card.innerHTML = `
    <h1>HAKUFU</h1>
    <p class="sub">${isRegister ? 'Crea tu cuenta' : 'Inicia sesión para leer tu biblioteca'}</p>
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
      <button type="submit" class="btn">${isRegister ? 'Crear cuenta' : 'Entrar'}</button>
      <div class="auth-error" id="auth-error"></div>
    </form>
    <div class="auth-switch">
      ${isRegister
        ? `¿Ya tienes cuenta? <button id="switch-link">Inicia sesión</button>`
        : `¿No tienes cuenta? <button id="switch-link">Regístrate</button>`}
    </div>
  `;
  wrap.appendChild(card);
  container.appendChild(wrap);

  card.querySelector('#switch-link').addEventListener('click', () => {
    navigate(isRegister ? '/login' : '/register');
  });

  card.querySelector('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const errorEl = card.querySelector('#auth-error');
    errorEl.textContent = '';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const result = isRegister
        ? await api.register(form.get('username'), form.get('email'), form.get('password'), form.get('password_confirm'))
        : await api.login(form.get('username'), form.get('password'));
      setSession(result.access_token, result.username);
      navigate('/library');
      render();
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

// ── Library ─────────────────────────────────────────────────────────────
async function renderLibrary(container) {
  container.innerHTML = '<h2>Biblioteca</h2><div class="empty-state">Cargando…</div>';

  let data;
  try {
    data = await api.getLibrary();
  } catch (err) {
    container.innerHTML = `<h2>Biblioteca</h2><div class="empty-state">Error: ${err.message}</div>`;
    return;
  }

  const mangas = (data && data.mangas) || [];
  container.innerHTML = '<h2>Biblioteca</h2>';

  if (mangas.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Aún no hay nada aquí. Sube una copia de seguridad desde la app de escritorio.';
    container.appendChild(empty);
    return;
  }

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
  container.appendChild(grid);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
