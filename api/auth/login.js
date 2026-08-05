const { sql } = require('../../lib/db');
const { verifyPassword, makeToken } = require('../../lib/auth');
const { applyCors } = require('../../lib/cors');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string')
    return res.status(401).json({ detail: 'Credenciales incorrectas' });

  const rows = await sql`select username, password_hash from users where username = ${username}`;
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return res.status(401).json({ detail: 'Credenciales incorrectas' });

  await sql`update users set last_seen = now() where username = ${username}`;

  return res.status(200).json({
    access_token: makeToken(username),
    token_type: 'bearer',
    username: user.username,
  });
};
