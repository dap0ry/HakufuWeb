const { sql } = require('../../../lib/db');
const { getCurrentUser } = require('../../../lib/auth');
const { applyCors } = require('../../../lib/cors');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const { username } = req.query;

  if (req.method === 'POST') {
    if (username === me)
      return res.status(400).json({ detail: 'No puedes añadirte a ti mismo' });

    const exists = await sql`select 1 from users where username = ${username}`;
    if (!exists.length) return res.status(404).json({ detail: 'Usuario no encontrado' });

    const dup = await sql`
      select 1 from friendships
      where (requester = ${me} and recipient = ${username})
         or (requester = ${username} and recipient = ${me})
    `;
    if (dup.length) return res.status(409).json({ detail: 'Ya existe una solicitud o amistad' });

    await sql`insert into friendships (requester, recipient, status) values (${me}, ${username}, 'pending')`;
    return res.status(201).end();
  }

  if (req.method === 'DELETE') {
    await sql`
      delete from friendships
      where requester = ${username} and recipient = ${me} and status = 'pending'
    `;
    return res.status(204).end();
  }

  return res.status(405).json({ detail: 'Method not allowed' });
};
