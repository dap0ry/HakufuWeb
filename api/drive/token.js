const { sql } = require('../../lib/db');
const { getCurrentUser } = require('../../lib/auth');
const { applyCors } = require('../../lib/cors');
const { refreshAccessToken } = require('../../lib/google');

// Mints a short-lived Google Drive access token from the stored refresh token.
// The refresh token itself never leaves the server — desktop and web both call
// this, then talk to googleapis.com directly with the returned access_token.
module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });

  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const rows = await sql`select refresh_token from google_connections where username = ${me}`;
  const row = rows[0];
  if (!row) return res.status(404).json({ detail: 'Google Drive no está conectado' });

  try {
    const tokens = await refreshAccessToken(row.refresh_token);
    return res.status(200).json({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
    });
  } catch (err) {
    return res.status(502).json({ detail: err.message || 'No se pudo renovar el acceso a Google Drive' });
  }
};
