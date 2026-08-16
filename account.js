import { api, getUsername, clearSession } from './api.js';

// Pestaña "Cuenta": tu propio perfil (con foto editable) + la conexión con
// Dropbox. Si tienes el perfil marcado como privado, /users/{username}
// devuelve 403 — no rompemos la pantalla por eso, seguimos mostrando el
// usuario (ya lo tenemos guardado localmente) y el resto de la pantalla
// igualmente.
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
  container.appendChild(renderProfileCard(username, profile, profileError));

  const dropboxHeading = document.createElement('h3');
  dropboxHeading.textContent = 'Dropbox';
  dropboxHeading.style.cssText = 'font-size:13px;color:var(--secondary);margin:24px 0 12px;text-transform:uppercase;letter-spacing:0.5px;';
  container.appendChild(dropboxHeading);
  container.appendChild(await renderDropboxCard());
}

function renderProfileCard(username, profile, profileError) {
  const card = document.createElement('div');
  card.className = 'card';

  const initial = escapeHtml((username[0] || '?').toUpperCase());
  const avatarInner = profile?.avatar_url
    ? `<img src="${profile.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;">`
    : initial;

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
      <button id="avatar-btn" title="Cambiar foto de perfil" style="
        width:64px;height:64px;border-radius:50%;border:none;padding:0;cursor:pointer;
        background:var(--border);display:flex;align-items:center;justify-content:center;
        font-size:22px;font-weight:700;color:var(--text);overflow:hidden;position:relative;flex-shrink:0;">
        ${avatarInner}
      </button>
      <div>
        <div style="font-size:17px;font-weight:700;">${escapeHtml(username)}</div>
        <button id="avatar-edit-link" style="background:none;border:none;color:var(--secondary);font-size:12px;
          text-decoration:underline;cursor:pointer;padding:4px 0;">Cambiar foto</button>
      </div>
    </div>
    <input type="file" id="avatar-input" accept="image/jpeg,image/png,image/gif" style="display:none;">
    <div class="account-error" id="avatar-error"></div>
    ${detailHtml}
    <button class="btn btn-danger" id="logout-btn" style="margin-top:20px;">Cerrar sesión</button>
  `;

  const fileInput = card.querySelector('#avatar-input');
  const openPicker = () => fileInput.click();
  card.querySelector('#avatar-btn').addEventListener('click', openPicker);
  card.querySelector('#avatar-edit-link').addEventListener('click', openPicker);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const errorEl = card.querySelector('#avatar-error');
    errorEl.textContent = '';

    if (file.size > 2 * 1024 * 1024) {
      errorEl.textContent = 'La imagen no puede superar los 2 MB.';
      fileInput.value = '';
      return;
    }

    try {
      const { avatar_url } = await api.uploadAvatar(file);
      const avatarBtn = card.querySelector('#avatar-btn');
      avatarBtn.innerHTML = `<img src="${avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      fileInput.value = '';
    }
  });

  card.querySelector('#logout-btn').addEventListener('click', () => {
    clearSession();
    location.hash = '';
  });

  return card;
}

async function renderDropboxCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<div class="empty-state">Comprobando conexión…</div>';

  let status;
  try {
    status = await api.dropboxStatus();
  } catch (err) {
    card.innerHTML = `<div class="empty-state">Error: ${escapeHtml(err.message)}</div>`;
    return card;
  }

  if (status.connected) {
    const connectedAt = status.connected_at ? new Date(status.connected_at).toLocaleDateString() : '';
    card.innerHTML = `
      <div class="status-line on">● Dropbox conectado</div>
      <p>Conectado desde ${connectedAt}. La subida de mangas se hace desde la app de escritorio; aquí puedes leerlos y desconectar la cuenta.</p>
      <button class="btn btn-danger" id="disconnect-btn">Desconectar</button>
    `;
    card.querySelector('#disconnect-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await api.dropboxDisconnect();
        const fresh = await renderDropboxCard();
        card.replaceWith(fresh);
      } catch (err) {
        alert(err.message);
        e.target.disabled = false;
      }
    });
  } else {
    card.innerHTML = `
      <div class="status-line off">○ Dropbox no conectado</div>
      <p>Conecta tu cuenta de Dropbox para leer aquí los mangas que hayas respaldado desde la app de escritorio. Hakufu solo accede a su propia carpeta dentro de tu Dropbox, nunca al resto.</p>
      <button class="btn" id="connect-btn">Conectar Dropbox</button>
    `;
    card.querySelector('#connect-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const { link_url } = await api.dropboxConnectStart();
        location.href = link_url;
      } catch (err) {
        alert(err.message);
        e.target.disabled = false;
      }
    });
  }

  return card;
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
