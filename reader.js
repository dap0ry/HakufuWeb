import { api } from './api.js';
import { getOffline } from './offline-store.js';
import { downloadFromDropbox } from './dropbox-content.js';
import { getLocalManga } from './local-library.js';

// v1 scope: PDF and CBZ render page-by-page in the browser. CBR (RAR) has no
// reliable pure-JS decoder, so it falls back to a plain download button instead
// of a paginated view.
const PDFJS_URL        = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';
const JSZIP_URL         = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

export async function renderReader(root, mangaId) {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'reader';
  wrap.innerHTML = `
    <div class="reader-topbar">
      <button id="exit-btn" class="btn-ghost" style="padding:6px 12px;">✕ Salir</button>
      <span class="title" id="reader-title">Cargando…</span>
      <span></span>
    </div>
    <div class="reader-page" id="reader-page"><div class="empty-state">Cargando manga…</div></div>
    <div class="reader-controls" id="reader-controls" style="display:none">
      <button id="prev-btn">◀ Anterior</button>
      <span id="page-indicator"></span>
      <button id="next-btn">Siguiente ▶</button>
    </div>
  `;
  root.appendChild(wrap);

  const pageEl = wrap.querySelector('#reader-page');
  const titleEl = wrap.querySelector('#reader-title');

  // Toca la página → alterna la barra superior/inferior. Toca un botón → ese
  // botón hace lo suyo, no también el toggle (por eso stopPropagation en cada uno).
  wrap.classList.add('controls-hidden');
  pageEl.addEventListener('click', () => wrap.classList.toggle('controls-hidden'));
  for (const btn of wrap.querySelectorAll('.reader-topbar button, .reader-controls button')) {
    btn.addEventListener('click', (e) => e.stopPropagation());
  }
  wrap.querySelector('#exit-btn').addEventListener('click', () => { location.hash = '/library'; });

  try {
    // Un manga local (creado desde este propio móvil) nunca pasa por Dropbox —
    // se lee directamente de su blob en IndexedDB.
    const local = await getLocalManga(mangaId);

    let blob, contentType, title;
    if (local) {
      title = local.title;
      blob = local.fileBlob;
      contentType = local.mimeType || '';
    } else {
      const library = await api.getLibrary();
      const manga = (library.mangas || []).find((m) => m.id === mangaId);
      if (!manga) throw new Error('No se encontró ese manga en tu biblioteca.');
      if (!manga.dropbox_path) throw new Error('Este manga no está respaldado en Dropbox.');

      title = manga.title;

      // Si ya se descargó para offline, se lee de ahí directamente — ni token
      // de Dropbox ni red, funciona sin conexión.
      const cached = await getOffline(manga.id);
      if (cached) {
        blob = cached.blob;
        contentType = cached.mimeType || '';
      } else {
        const { access_token } = await api.dropboxToken();
        const resp = await downloadFromDropbox(access_token, manga.dropbox_path).catch(() => {
          throw new Error('No se pudo descargar el archivo desde Dropbox.');
        });
        const ext = (manga.dropbox_path.split('.').pop() || '').toLowerCase();
        contentType = ext === 'pdf' ? 'application/pdf' : (ext === 'cbz' || ext === 'zip') ? 'application/zip' : '';
        blob = await resp.blob();
      }
    }

    titleEl.textContent = title || '';

    if (contentType.includes('pdf')) {
      await openPdf(wrap, blob);
    } else if (contentType.includes('zip')) {
      await openCbz(wrap, blob);
    } else {
      openUnsupported(wrap, blob, title);
    }
  } catch (err) {
    wrap.classList.remove('controls-hidden'); // sin páginas que ver, no tiene sentido ocultar la salida
    pageEl.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function openPdf(wrap, blob) {
  const pageEl = wrap.querySelector('#reader-page');
  const controls = wrap.querySelector('#reader-controls');
  const indicator = wrap.querySelector('#page-indicator');

  const pdfjsLib = await import(/* webpackIgnore: true */ PDFJS_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

  const buffer = await blob.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;

  let current = 1;
  const canvas = document.createElement('canvas');
  pageEl.innerHTML = '';
  pageEl.appendChild(canvas);
  controls.style.display = 'flex';

  async function renderPage(num) {
    const page = await doc.getPage(num);
    const viewport = page.getViewport({ scale: Math.min(2, window.devicePixelRatio || 1) * fitScale(page) });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    indicator.textContent = `${num} / ${doc.numPages}`;
  }

  function fitScale(page) {
    const vp = page.getViewport({ scale: 1 });
    const maxW = pageEl.clientWidth || 800;
    const maxH = pageEl.clientHeight || 900;
    return Math.min(maxW / vp.width, maxH / vp.height);
  }

  wrap.querySelector('#prev-btn').addEventListener('click', () => {
    if (current > 1) { current--; renderPage(current); }
  });
  wrap.querySelector('#next-btn').addEventListener('click', () => {
    if (current < doc.numPages) { current++; renderPage(current); }
  });

  await renderPage(current);
}

async function openCbz(wrap, blob) {
  const pageEl = wrap.querySelector('#reader-page');
  const controls = wrap.querySelector('#reader-controls');
  const indicator = wrap.querySelector('#page-indicator');

  const { default: JSZip } = await import(/* webpackIgnore: true */ JSZIP_URL);
  const zip = await JSZip.loadAsync(blob);

  const imageEntries = Object.values(zip.files)
    .filter((f) => !f.dir && /\.(jpe?g|png|gif|webp)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (imageEntries.length === 0) throw new Error('El archivo CBZ no contiene imágenes reconocibles.');

  const urls = new Array(imageEntries.length).fill(null);
  let current = 0;

  const img = document.createElement('img');
  pageEl.innerHTML = '';
  pageEl.appendChild(img);
  controls.style.display = 'flex';

  async function showPage(i) {
    if (!urls[i]) {
      const data = await imageEntries[i].async('blob');
      urls[i] = URL.createObjectURL(data);
    }
    img.src = urls[i];
    indicator.textContent = `${i + 1} / ${imageEntries.length}`;
  }

  wrap.querySelector('#prev-btn').addEventListener('click', () => {
    if (current > 0) { current--; showPage(current); }
  });
  wrap.querySelector('#next-btn').addEventListener('click', () => {
    if (current < imageEntries.length - 1) { current++; showPage(current); }
  });

  await showPage(current);
}

function openUnsupported(wrap, blob, title) {
  const pageEl = wrap.querySelector('#reader-page');
  wrap.classList.remove('controls-hidden'); // sin paginación, no hay nada que ocultar
  const url = URL.createObjectURL(blob);
  pageEl.innerHTML = `
    <div class="empty-state">
      <p style="margin-bottom:16px">Este formato (CBR) no se puede leer todavía directamente en el navegador.</p>
      <a class="btn" href="${url}" download="${escapeHtml(title || 'manga')}.cbr">Descargar archivo</a>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
