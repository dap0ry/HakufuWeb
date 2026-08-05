import { api } from './api.js';

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
      <a href="#/library" class="btn-ghost" style="padding:6px 12px;text-decoration:none;">← Biblioteca</a>
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

  try {
    const library = await api.getLibrary();
    const manga = (library.mangas || []).find((m) => m.id === mangaId);
    if (!manga) throw new Error('No se encontró ese manga en tu biblioteca.');
    if (!manga.drive_file_id) throw new Error('Este manga no está respaldado en Drive.');

    titleEl.textContent = manga.title || '';

    const { access_token } = await api.driveToken();
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${manga.drive_file_id}?alt=media`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    if (!resp.ok) throw new Error('No se pudo descargar el archivo desde Drive.');

    const contentType = resp.headers.get('Content-Type') || '';
    const blob = await resp.blob();

    if (contentType.includes('pdf')) {
      await openPdf(wrap, blob);
    } else if (contentType.includes('zip')) {
      await openCbz(wrap, blob);
    } else {
      openUnsupported(wrap, blob, manga.title);
    }
  } catch (err) {
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
