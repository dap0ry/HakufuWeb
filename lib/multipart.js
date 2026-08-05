const busboy = require('busboy');

// Lee un único archivo (+ campos de texto) de una petición multipart/form-data.
// `maxBytes` corta el stream si se supera (se refleja en el `tooLarge` devuelto,
// nunca lanza por tamaño).
function parseMultipart(req, { maxBytes = 2 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers, limits: { fileSize: maxBytes } });
    const fields = {};
    let fileBuffer = null;
    let mimeType = null;
    let tooLarge = false;

    bb.on('file', (_name, stream, info) => {
      mimeType = info.mimeType;
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => { tooLarge = true; });
      stream.on('end', () => { fileBuffer = Buffer.concat(chunks); });
    });

    bb.on('field', (name, value) => { fields[name] = value; });
    bb.on('close', () => resolve({ fileBuffer, mimeType, tooLarge, fields }));
    bb.on('error', reject);

    req.pipe(bb);
  });
}

module.exports = { parseMultipart };
