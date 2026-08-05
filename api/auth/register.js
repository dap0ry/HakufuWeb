const { sql } = require('../../lib/db');
const { hashPassword, makeToken } = require('../../lib/auth');
const { applyCors } = require('../../lib/cors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

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
};
