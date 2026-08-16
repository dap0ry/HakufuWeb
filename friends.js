import { api } from './api.js';

// Pestaña "Amigos": lista de amigos, solicitudes pendientes, y un formulario
// para añadir por nombre de usuario. El backend (api/friends/…) ya existía;
// esto es solo el cliente.
export async function renderFriends(container) {
  container.innerHTML = '<h2>Amigos</h2><div class="empty-state">Cargando…</div>';

  let friends, requests;
  try {
    [friends, requests] = await Promise.all([api.getFriends(), api.getPendingRequests()]);
  } catch (err) {
    container.innerHTML = `<h2>Amigos</h2><div class="empty-state">Error: ${escapeHtml(err.message)}</div>`;
    return;
  }

  container.innerHTML = '<h2>Amigos</h2>';
  container.appendChild(renderAddFriendCard());

  if (requests.length > 0) {
    container.appendChild(renderRequestsCard(requests, container));
  }

  container.appendChild(renderFriendsList(friends));
}

function renderAddFriendCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>Añadir amigo</h3>
    <form id="add-friend-form" style="display:flex;gap:8px;">
      <input type="text" name="username" placeholder="Nombre de usuario" required autocomplete="off"
             style="flex:1;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:9px 11px;font-size:13px;">
      <button type="submit" class="btn">Enviar</button>
    </form>
    <div class="account-error" id="add-friend-msg"></div>
  `;

  card.querySelector('#add-friend-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const username = String(form.get('username') || '').trim();
    const msgEl = card.querySelector('#add-friend-msg');
    msgEl.textContent = '';
    if (!username) return;

    try {
      await api.sendFriendRequest(username);
      e.target.reset();
      msgEl.style.color = 'var(--success)';
      msgEl.textContent = 'Solicitud enviada.';
    } catch (err) {
      msgEl.style.color = 'var(--error)';
      msgEl.textContent = err.message;
    }
  });

  return card;
}

function renderRequestsCard(requests, pageContainer) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<h3>Solicitudes pendientes</h3>';

  for (const r of requests) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-top:14px;';
    row.innerHTML = `
      <span style="font-size:13px;">${escapeHtml(r.from)}</span>
      <div style="display:flex;gap:8px;">
        <button class="btn" data-action="accept" style="padding:8px 14px;">Aceptar</button>
        <button class="btn-ghost" data-action="reject" style="padding:8px 14px;">Rechazar</button>
      </div>
    `;

    row.querySelector('[data-action="accept"]').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await api.acceptFriendRequest(r.from);
        renderFriends(pageContainer);
      } catch (err) {
        alert(err.message);
        e.target.disabled = false;
      }
    });

    row.querySelector('[data-action="reject"]').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await api.rejectFriendRequest(r.from);
        renderFriends(pageContainer);
      } catch (err) {
        alert(err.message);
        e.target.disabled = false;
      }
    });

    card.appendChild(row);
  }

  return card;
}

function renderFriendsList(friends) {
  if (friends.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Todavía no tienes amigos añadidos.';
    return empty;
  }

  const grid = document.createElement('div');
  grid.className = 'grid';

  for (const f of friends) {
    const initial = escapeHtml((f.username[0] || '?').toUpperCase());
    const card = document.createElement('div');
    card.className = 'manga-card';
    card.innerHTML = `
      <div class="manga-cover" style="aspect-ratio:1;border-radius:50%;">
        ${f.avatar_url ? `<img src="${f.avatar_url}" alt="">` : initial}
      </div>
      <div class="manga-title" style="text-align:center;">${escapeHtml(f.username)}</div>
    `;
    grid.appendChild(card);
  }

  return grid;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
