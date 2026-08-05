// /api/auth/login + /api/auth/register in one function (segmento único —
// Vercel no soporta catch-all [...x] fuera de frameworks como Next.js, solo
// segmentos dinámicos simples [x], de ahí la reestructuración).
const { sql } = require('../../lib/db');
const { hashPassword, verifyPassword, makeToken } = require('../../lib/auth');
const { applyCors } = require('../../lib/cors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const { action } = req.query;
  if (action === 'register' && req.method === 'POST') return register(req, res);
  if (action === 'login'    && req.method === 'POST') return login(req, res);

  return res.status(404).json({ detail: 'Not found' });
};

async function register(req, res) {
  const { username, email, password, password_confirm } = req.body || {};

  if (typeof username !== 'string' || username.length < 3 || username.length > 30)
    return res.status(400).json({ detail: 'El nombre de usuario debe tener entre 3 y 30 caracteres' });
  if (typeof email !== 'string' || !EMAIL_RE.test(email))
    return res.status(400).json({ detail: 'Email inválido' });
  if (typeof password !== 'string' || password.length < 6)
    return res.status(400).json({ detail: 'La contraseña debe tener al menos 6 caracteres' });
  if (password !== password_confirm)
    return res.status(400).json({ detail: 'Las contraseñas no coinciden' });

  const existingUsername = await sql`select 1 from users where username = ${username}`;
  if (existingUsername.length)
    return res.status(409).json({ detail: 'Nombre de usuario ya en uso' });

  const existingEmail = await sql`select 1 from users where email = ${email}`;
  if (existingEmail.length)
    return res.status(409).json({ detail: 'Email ya registrado' });

  const passwordHash = await hashPassword(password);
  await sql`
    insert into users (username, email, password_hash)
    values (${username}, ${email}, ${passwordHash})
  `;

  return res.status(201).json({
    access_token: makeToken(username),
    token_type: 'bearer',
    username,
  });
}

async function login(req, res) {
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
}
