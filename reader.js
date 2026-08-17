import { api } from './api.js';
import { getOffline, getProgress, saveProgress } from './offline-store.js';
import { downloadFromDropbox } from './dropbox-content.js';
import { getLocalManga } from './local-library.js';

// PDF, CBZ y CBR se leen página a página en el navegador. El CBR usa
// node-unrar-js (el propio unrar de RARLab compilado a WASM) para
// descomprimir — mismo patrón que JSZip para CBZ, pero aquí hay que cargar
// también el binario .wasm por separado desde el CDN (node-unrar-js lo pide
// así explícitamente para uso en navegador, en vez de resolverlo él solo
// como hace en Node).
const PDFJS_URL        = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';
const JSZIP_URL         = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
const UNRAR_JS_URL      = 'https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/+esm';
const UNRAR_WASM_URL    = 'https://cdn.jsdelivr.net/npm/node-unrar-js@2.0.2/esm/js/unrar.wasm';

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
        contentType = ext === 'pdf' ? 'application/pdf'
          : (ext === 'cbz' || ext === 'zip') ? 'application/zip'
          : (ext === 'cbr' || ext === 'rar') ? 'application/vnd.rar'
          : '';
        blob = await resp.blob();
      }
    }

    titleEl.textContent = title || '';

    // Por dónde se dejó la última vez — se restaura al abrir y se va
    // actualizando en cada cambio de página, no solo al salir con el botón.
    const savedPage = await getProgress(mangaId).catch(() => null);

    if (contentType.includes('pdf')) {
      await openPdf(wrap, blob, mangaId, savedPage);
    } else if (contentType.includes('zip')) {
      await openCbz(wrap, blob, mangaId, savedPage);
    } else if (contentType.includes('rar')) {
      await openCbr(wrap, blob, mangaId, savedPage);
    } else {
      openUnsupported(wrap, blob, title);
    }
  } catch (err) {
    wrap.classList.remove('controls-hidden'); // sin páginas que ver, no tiene sentido ocultar la salida
    pageEl.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

async function openPdf(wrap, blob, mangaId, savedPage) {
  const pageEl = wrap.querySelector('#reader-page');
  const controls = wrap.querySelector('#reader-controls');
  const indicator = wrap.querySelector('#page-indicator');

  const pdfjsLib = await import(/* webpackIgnore: true */ PDFJS_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

  const buffer = await blob.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;

  // Página guardada (1-indexada, como numPages) si hay y sigue siendo válida
  // para este archivo — si no, empieza desde el principio.
  let current = (savedPage != null) ? Math.min(Math.max(savedPage, 1), doc.numPages) : 1;
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
    saveProgress(mangaId, num).catch(() => {});
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

async function openCbz(wrap, blob, mangaId, savedPage) {
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
  // Página guardada (0-indexada) si hay y sigue siendo válida para este
  // archivo — si no, empieza desde el principio.
  let current = (savedPage != null) ? Math.min(Math.max(savedPage, 0), imageEntries.length - 1) : 0;

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
    saveProgress(mangaId, i).catch(() => {});
  }

  wrap.querySelector('#prev-btn').addEventListener('click', () => {
    if (current > 0) { current--; showPage(current); }
  });
  wrap.querySelector('#next-btn').addEventListener('click', () => {
    if (current < imageEntries.length - 1) { current++; showPage(current); }
  });

  await showPage(current);
}

async function openCbr(wrap, blob, mangaId, savedPage) {
  const pageEl = wrap.querySelector('#reader-page');
  const controls = wrap.querySelector('#reader-controls');
  const indicator = wrap.querySelector('#page-indicator');

  const [{ createExtractorFromData }, data, wasmBinary] = await Promise.all([
    import(/* webpackIgnore: true */ UNRAR_JS_URL),
    blob.arrayBuffer(),
    fetch(UNRAR_WASM_URL).then((r) => r.arrayBuffer()),
  ]);
  const extractor = await createExtractorFromData({ data, wasmBinary });

  const imageEntries = [...extractor.getFileList().fileHeaders]
    .filter((h) => !h.flags.directory && /\.(jpe?g|png|gif|webp)$/i.test(h.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (imageEntries.length === 0) throw new Error('El archivo CBR no contiene imágenes reconocibles.');

  const urls = new Array(imageEntries.length).fill(null);
  // Página guardada (0-indexada) si hay y sigue siendo válida para este
  // archivo — si no, empieza desde el principio.
  let current = (savedPage != null) ? Math.min(Math.max(savedPage, 0), imageEntries.length - 1) : 0;

  const img = document.createElement('img');
  pageEl.innerHTML = '';
  pageEl.appendChild(img);
  controls.style.display = 'flex';

  // A diferencia de JSZip (openCbz), extractor.extract() aquí es síncrono —
  // el mismo extractor se reutiliza para descomprimir cada página bajo
  // demanda, en vez de todo el CBR de golpe al abrirlo.
  function showPage(i) {
    if (!urls[i]) {
      const [extracted] = [...extractor.extract({ files: [imageEntries[i].name] }).files];
      urls[i] = URL.createObjectURL(new Blob([extracted.extraction]));
    }
    img.src = urls[i];
    indicator.textContent = `${i + 1} / ${imageEntries.length}`;
    saveProgress(mangaId, i).catch(() => {});
  }

  wrap.querySelector('#prev-btn').addEventListener('click', () => {
    if (current > 0) { current--; showPage(current); }
  });
  wrap.querySelector('#next-btn').addEventListener('click', () => {
    if (current < imageEntries.length - 1) { current++; showPage(current); }
  });

  showPage(current);
}

function openUnsupported(wrap, blob, title) {
  const pageEl = wrap.querySelector('#reader-page');
  wrap.classList.remove('controls-hidden'); // sin paginación, no hay nada que ocultar
  const url = URL.createObjectURL(blob);
  pageEl.innerHTML = `
    <div class="empty-state">
      <p style="margin-bottom:16px">Este formato no se puede leer directamente en el navegador.</p>
      <a class="btn" href="${url}" download="${escapeHtml(title || 'manga')}">Descargar archivo</a>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
