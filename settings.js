import { api } from './api.js';
import {
  saveOffline, listOfflineIds, offlineStorageEstimate,
  saveBackground, removeBackground, applyBackground,
} from './offline-store.js';

// Pestaña "Configuración": apariencia (fondo de pantalla) y lectura sin
// conexión. La conexión con Google Drive en sí vive en Cuenta — aquí solo
// se consulta su estado para saber si tiene sentido mostrar la tarjeta de
// descargas offline.
export async function renderSettings(container) {
  container.innerHTML = '<h2>Configuración</h2>';

  const appearanceHeading = document.createElement('h3');
  appearanceHeading.textContent = 'Apariencia';
  appearanceHeading.style.cssText = 'font-size:13px;color:var(--secondary);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;';
  container.appendChild(appearanceHeading);
  container.appendChild(await renderBackgroundCard());

  const offlineHeading = document.createElement('h3');
  offlineHeading.textContent = 'Lectura sin conexión';
  offlineHeading.style.cssText = 'font-size:13px;color:var(--secondary);margin:24px 0 12px;text-transform:uppercase;letter-spacing:0.5px;';
  container.appendChild(offlineHeading);

  let status;
  try {
    status = await api.driveStatus();
  } catch (err) {
    const errCard = document.createElement('div');
    errCard.className = 'empty-state';
    errCard.textContent = `Error: ${err.message}`;
    container.appendChild(errCard);
    return;
  }

  if (status.connected) {
    container.appendChild(await renderOfflineCard());
  } else {
    const note = document.createElement('div');
    note.className = 'empty-state';
    note.textContent = 'Conecta Google Drive desde Cuenta para poder descargar mangas y leerlos sin conexión.';
    container.appendChild(note);
  }
}

// Fondo de pantalla personalizado — a propósito con muy poca opacidad
// (se aplica en index.html con opacity: 0.08): se nota que está, sin
// competir con el contenido ni afectar al rendimiento.
async function renderBackgroundCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>Fondo de Hakufu</h3>
    <p>Ponle una imagen de fondo a la app — se ve muy sutil, solo un toque, para no estorbar a la lectura.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn" id="bg-pick-btn">Elegir imagen</button>
      <button class="btn-ghost" id="bg-remove-btn">Quitar fondo</button>
    </div>
    <input type="file" id="bg-input" accept="image/*" style="display:none;">
    <div class="account-error" id="bg-error"></div>
  `;

  const fileInput = card.querySelector('#bg-input');
  card.querySelector('#bg-pick-btn').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const errorEl = card.querySelector('#bg-error');
    errorEl.textContent = '';
    try {
      await saveBackground(file);
      await applyBackground();
    } catch (err) {
      errorEl.textContent = 'No se pudo guardar la imagen: ' + err.message;
    } finally {
      fileInput.value = '';
    }
  });

  card.querySelector('#bg-remove-btn').addEventListener('click', async () => {
    await removeBackground();
    await applyBackground();
  });

  return card;
}

// Descarga todo lo respaldado en Drive a este dispositivo (IndexedDB) para
// poder leerlo sin conexión — no hay selector de carpeta real posible en
// Safari/iOS (no soporta File System Access API), así que esto es lo que de
// verdad hace posible "leer offline en el móvil". (En Biblioteca también se
// puede descargar manga a manga, tocando su portada en gris.)
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
