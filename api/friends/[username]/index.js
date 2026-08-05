const { sql } = require('../../../lib/db');
const { getCurrentUser } = require('../../../lib/auth');
const { applyCors } = require('../../../lib/cors');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'DELETE') return res.status(405).json({ detail: 'Method not allowed' });

  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const { username } = req.query;

  await sql`
    delete from friendships
    where ((requester = ${me} and recipient = ${username})
        or (requester = ${username} and recipient = ${me}))
      and status = 'accepted'
  `;

  return res.status(204).end();
};
