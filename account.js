import { api, getUsername, clearSession } from './api.js';

// Pestaña "Cuenta": tu propio perfil. Si tienes el perfil marcado como
// privado, /users/{username} devuelve 403 — no rompemos la pantalla por eso,
// seguimos mostrando el usuario (ya lo tenemos guardado localmente) y el
// botón de cerrar sesión igualmente.
export async function renderAccount(container) {
  const username = getUsername() || '';
  container.innerHTML = '<h2>Cuenta</h2><div class="empty-state">Cargando…</div>';

  let profile = null;
  let profileError = false;
  try {
    profile = await api.getProfile(username);
  } catch {
    profileError = true;
  }

  container.innerHTML = '<h2>Cuenta</h2>';

  const card = document.createElement('div');
  card.className = 'card';

  const initial = escapeHtml((username[0] || '?').toUpperCase());
  const avatarHtml = profile?.avatar_url
    ? `<img src="${profile.avatar_url}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover;">`
    : `<div style="width:64px;height:64px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;">${initial}</div>`;

  const detailHtml = profile
    ? `
      <p style="margin-top:14px;font-size:13px;color:var(--secondary);">
        ${profile.mangas_count} manga${profile.mangas_count === 1 ? '' : 's'} · ${formatUsage(profile.total_usage_seconds)}
      </p>
      ${profile.bio ? `<p style="margin-top:8px;font-size:13px;color:var(--secondary);">${escapeHtml(profile.bio)}</p>` : ''}
    `
    : profileError
      ? '<p style="margin-top:14px;font-size:12px;color:var(--secondary);">Tu perfil es privado o no se pudo cargar el detalle — tu sesión sigue activa con normalidad.</p>'
      : '';

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;">
      ${avatarHtml}
      <div style="font-size:17px;font-weight:700;">${escapeHtml(username)}</div>
    </div>
    ${detailHtml}
    <button class="btn btn-danger" id="logout-btn" style="margin-top:20px;">Cerrar sesión</button>
  `;
  container.appendChild(card);

  card.querySelector('#logout-btn').addEventListener('click', () => {
    clearSession();
    location.hash = '';
  });
}

function formatUsage(seconds) {
  const hours = Math.floor((seconds || 0) / 3600);
  return hours > 0 ? `${hours} h de lectura` : 'sin tiempo de lectura registrado aún';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
