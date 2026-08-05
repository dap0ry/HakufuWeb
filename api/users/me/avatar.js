const { sql } = require('../../../lib/db');
const { getCurrentUser } = require('../../../lib/auth');
const { applyCors } = require('../../../lib/cors');
const { parseMultipart } = require('../../../lib/multipart');
const { uploadImage } = require('../../../lib/cloudinary');

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const { fileBuffer, mimeType, tooLarge } = await parseMultipart(req, { maxBytes: MAX_BYTES });
  if (tooLarge) return res.status(400).json({ detail: 'La imagen no puede superar los 2 MB' });
  if (!fileBuffer) return res.status(400).json({ detail: 'Falta el archivo' });
  if (!ALLOWED_TYPES.has(mimeType))
    return res.status(400).json({ detail: 'Formato no soportado. Usa JPG, PNG o GIF' });

  const result = await uploadImage(fileBuffer, mimeType, `hakufu/${me}/avatar`);

  await sql`update users set avatar_url = ${result.secure_url} where username = ${me}`;

  return res.status(200).json({ avatar_url: result.secure_url });
};
