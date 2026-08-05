import { api } from './api.js';
import { saveOffline, listOfflineIds, offlineStorageEstimate } from './offline-store.js';

// Web-only screen: connect/disconnect Google Drive and see status. Uploading
// manga files themselves only happens from the desktop app (it's the only side
// with access to the actual files) — this page never uploads anything.
export async function renderBackup(container) {
  container.innerHTML = '<h2>Copia de seguridad</h2><div class="empty-state">Comprobando conexión…</div>';

  let status;
  try {
    status = await api.driveStatus();
  } catch (err) {
    container.innerHTML = `<h2>Copia de seguridad</h2><div class="empty-state">Error: ${err.message}</div>`;
    return;
  }

  container.innerHTML = '<h2>Copia de seguridad</h2>';

  const card = document.createElement('div');
  card.className = 'card';

  if (status.connected) {
    const connectedAt = status.connected_at ? new Date(status.connected_at).toLocaleDateString() : '';
    card.innerHTML = `
      <div class="status-line on">● Google Drive conectado</div>
      <p>Conectado desde ${connectedAt}. La subida de mangas se hace desde la app de escritorio; aquí puedes leerlos y desconectar la cuenta.</p>
      <button class="btn btn-danger" id="disconnect-btn">Desconectar</button>
    `;
    card.querySelector('#disconnect-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        await api.driveDisconnect();
        renderBackup(container);
      } catch (err) {
        alert(err.message);
        e.target.disabled = false;
      }
    });
    container.appendChild(card);
    container.appendChild(await renderOfflineCard());
  } else {
    card.innerHTML = `
      <div class="status-line off">○ Google Drive no conectado</div>
      <p>Conecta tu cuenta de Google para leer aquí los mangas que hayas respaldado desde la app de escritorio. Hakufu solo accede a los archivos que él mismo crea en tu Drive.</p>
      <button class="btn" id="connect-btn">Conectar Google Drive</button>
    `;
    card.querySelector('#connect-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const { link_url } = await api.driveConnectStart();
        location.href = link_url;
      } catch (err) {
        alert(err.message);
        e.target.disabled = false;
      }
    });
    container.appendChild(card);
  }
}

// Descarga todo lo respaldado en Drive a este dispositivo (IndexedDB) para
// poder leerlo sin conexión — no hay selector de carpeta real posible en
// Safari/iOS (no soporta File System Access API), así que esto es lo que de
// verdad hace posible "leer offline en el móvil".
async function renderOfflineCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<div class="empty-state">Comprobando lo ya descargado…</div>';

  let library, offlineIds, estimate;
  try {
    [library, offlineIds, estimate] = await Promise.all([
      api.getLibrary(),
      listOfflineIds(),
      offlineStorageEstimate(),
    ]);
  } catch (err) {
    card.innerHTML = `<h3>Lectura sin conexión</h3><p>Error: ${escapeHtml(err.message)}</p>`;
    return card;
  }

  const mangas = (library.mangas || []).filter((m) => m.drive_file_id);
  const offlineSet = new Set(offlineIds);
  const pending = mangas.filter((m) => !offlineSet.has(m.id));

  const usageText = estimate?.usage
    ? `${(estimate.usage / (1024 * 1024)).toFixed(0)} MB usados en este dispositivo`
    : '';

  card.innerHTML = `
    <h3>Lectura sin conexión</h3>
    <p>Descarga tus mangas respaldados a este dispositivo para leerlos sin internet — se guardan en el propio navegador. ${mangas.length - pending.length} / ${mangas.length} ya están disponibles offline. ${usageText}</p>
    <button class="btn" id="download-offline-btn" ${pending.length === 0 ? 'disabled' : ''}>
      ${pending.length === 0 ? 'Todo descargado' : `Descargar ${pending.length} pendiente(s)`}
    </button>
    <div id="offline-progress" style="margin-top:12px;font-size:12px;color:var(--secondary);"></div>
  `;

  const btn = card.querySelector('#download-offline-btn');
  const progressEl = card.querySelector('#offline-progress');

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    let done = 0;
    for (const manga of pending) {
      progressEl.textContent = `Descargando ${done + 1} / ${pending.length} — ${manga.title}`;
      try {
        const { access_token } = await api.driveToken();
        const resp = await fetch(
          `https://www.googleapis.com/drive/v3/files/${manga.drive_file_id}?alt=media`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const mimeType = resp.headers.get('Content-Type') || 'application/octet-stream';
        const blob = await resp.blob();
        await saveOffline(manga.id, manga.title, blob, mimeType);
        done++;
      } catch (err) {
        console.error(`No se pudo descargar ${manga.title}:`, err);
      }
    }
    progressEl.textContent = `Descargados ${done} / ${pending.length}.`;
    setTimeout(() => renderOfflineCard().then((fresh) => card.replaceWith(fresh)), 800);
  });

  return card;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
