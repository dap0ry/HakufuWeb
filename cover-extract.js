// Genera una miniatura de portada a partir de un manga recién subido desde
// el móvil — primera página de un PDF, o primera imagen dentro de un CBZ.
// Mismas librerías (PDF.js / JSZip) que ya carga reader.js para leer, pero
// aquí solo se usa la primera página/imagen, escalada a tamaño de miniatura.
const PDFJS_URL        = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';
const JSZIP_URL        = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';

const THUMB_WIDTH = 320; // suficiente para una miniatura de portada nítida

// Devuelve un Blob PNG con la portada, o null si no se pudo generar (no
// bloquea añadir el manga — sin portada, se ve el título en su lugar).
export async function extractCover(fileBlob, mimeType) {
  try {
    if (mimeType.includes('pdf')) return await fromPdf(fileBlob);
    if (mimeType.includes('zip')) return await fromCbz(fileBlob);
  } catch (err) {
    console.error('No se pudo extraer la portada:', err);
  }
  return null;
}

async function fromPdf(blob) {
  const pdfjsLib = await import(/* webpackIgnore: true */ PDFJS_URL);
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

  const buffer = await blob.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await doc.getPage(1);

  const base = page.getViewport({ scale: 1 });
  const scale = THUMB_WIDTH / base.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function fromCbz(blob) {
  const { default: JSZip } = await import(/* webpackIgnore: true */ JSZIP_URL);
  const zip = await JSZip.loadAsync(blob);

  const imageEntries = Object.values(zip.files)
    .filter((f) => !f.dir && /\.(jpe?g|png|gif|webp)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (imageEntries.length === 0) return null;

  return await imageEntries[0].async('blob');
}
