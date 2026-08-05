const { sql } = require('../../../lib/db');
const { getCurrentUser } = require('../../../lib/auth');
const { applyCors } = require('../../../lib/cors');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'PUT') return res.status(405).json({ detail: 'Method not allowed' });

  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const { username } = req.query;

  const result = await sql`
    update friendships set status = 'accepted'
    where requester = ${username} and recipient = ${me} and status = 'pending'
    returning id
  `;
  if (!result.length) return res.status(404).json({ detail: 'Solicitud no encontrada' });

  return res.status(204).end();
};
