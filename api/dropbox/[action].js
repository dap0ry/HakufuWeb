// /api/dropbox/status + /token + /disconnect + /link-start in one function.
const crypto = require('crypto');
const { sql } = require('../../lib/db');
const { getCurrentUser } = require('../../lib/auth');
const { applyCors } = require('../../lib/cors');
const { refreshAccessToken, revokeToken } = require('../../lib/dropbox');

const LINK_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutos

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const { action } = req.query;

  if (action === 'status'     && req.method === 'GET')  return status(req, res);
  if (action === 'token'      && req.method === 'GET')  return token(req, res);
  if (action === 'disconnect' && req.method === 'POST') return disconnect(req, res);
  if (action === 'link-start' && req.method === 'POST') return linkStart(req, res);

  return res.status(404).json({ detail: 'Not found' });
};

async function status(req, res) {
  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const rows = await sql`select connected_at from dropbox_connections where username = ${me}`;
  const row = rows[0];
  return res.status(200).json({ connected: !!row, connected_at: row ? row.connected_at : null });
}

async function token(req, res) {
  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const rows = await sql`select refresh_token from dropbox_connections where username = ${me}`;
  const row = rows[0];
  if (!row) return res.status(404).json({ detail: 'Dropbox no está conectado' });

  try {
    const tokens = await refreshAccessToken(row.refresh_token);
    return res.status(200).json({ access_token: tokens.access_token, expires_in: tokens.expires_in });
  } catch (err) {
    return res.status(502).json({ detail: err.message || 'No se pudo renovar el acceso a Dropbox' });
  }
}

async function disconnect(req, res) {
  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const rows = await sql`delete from dropbox_connections where username = ${me} returning refresh_token`;
  const row = rows[0];
  if (row) await revokeToken(row.refresh_token);

  return res.status(204).end();
}

async function linkStart(req, res) {
  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const code = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await sql`insert into link_codes (code, username, expires_at) values (${code}, ${me}, ${expiresAt.toISOString()})`;

  const base = `https://${req.headers.host}`;
  return res.status(200).json({ link_url: `${base}/api/auth/dropbox/start?state=${encodeURIComponent(code)}` });
}
