import { api } from './api.js';

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
  }

  container.appendChild(card);
}
