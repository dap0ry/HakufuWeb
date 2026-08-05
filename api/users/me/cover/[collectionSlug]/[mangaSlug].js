const { sql } = require('../../../../lib/db');
const { getCurrentUser } = require('../../../../lib/auth');
const { applyCors } = require('../../../../lib/cors');
const { parseMultipart } = require('../../../../lib/multipart');
const { uploadImage } = require('../../../../lib/blob');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const { collectionSlug, mangaSlug } = req.query;
  const { fileBuffer, mimeType, fields } = await parseMultipart(req);
  const mangaId = fields.manga_id;

  if (!fileBuffer || !mangaId)
    return res.status(400).json({ detail: 'Faltan datos (archivo o manga_id)' });

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/gif' ? 'gif' : 'jpg';
  const result = await uploadImage(
    fileBuffer,
    mimeType || 'image/jpeg',
    `covers/${me}/${collectionSlug}/${mangaSlug}.${ext}`
  );

  const rows = await sql`select mangas from user_libraries where username = ${me}`;
  if (rows.length) {
    const mangas = rows[0].mangas || [];
    const idx = mangas.findIndex((m) => m.id === mangaId);
    if (idx !== -1) {
      mangas[idx] = { ...mangas[idx], cover_cloudinary_url: result.url };
      await sql`update user_libraries set mangas = ${JSON.stringify(mangas)} where username = ${me}`;
    }
  }

  return res.status(200).json({ cover_url: result.url });
};
