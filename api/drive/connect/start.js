const crypto = require('crypto');
const { sql } = require('../../../lib/db');
const { getCurrentUser } = require('../../../lib/auth');
const { applyCors } = require('../../../lib/cors');

const LINK_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutos — de sobra para que el usuario apruebe en el navegador

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const code = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

  await sql`insert into link_codes (code, username, expires_at) values (${code}, ${me}, ${expiresAt.toISOString()})`;

  const base = `https://${req.headers.host}`;
  return res.status(200).json({
    link_url: `${base}/api/auth/google/start?state=${encodeURIComponent(code)}`,
  });
};
