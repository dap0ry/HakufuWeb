const { sql } = require('../../lib/db');
const { getCurrentUser } = require('../../lib/auth');
const { applyCors } = require('../../lib/cors');
const { revokeToken } = require('../../lib/google');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const rows = await sql`delete from google_connections where username = ${me} returning refresh_token`;
  const row = rows[0];
  if (row) await revokeToken(row.refresh_token);

  return res.status(204).end();
};
