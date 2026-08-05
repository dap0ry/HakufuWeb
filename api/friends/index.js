// /api/friends (sin segmentos extra) no encaja en el catch-all [...action].js,
// que requiere al menos un segmento — de ahí este archivo separado solo para
// el listado.
const { sql } = require('../../lib/db');
const { getCurrentUser } = require('../../lib/auth');
const { applyCors } = require('../../lib/cors');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });

  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const rows = await sql`
    select u.username, u.avatar_url
    from friendships f
    join users u on u.username = case when f.requester = ${me} then f.recipient else f.requester end
    where (f.requester = ${me} or f.recipient = ${me}) and f.status = 'accepted'
  `;
  return res.status(200).json(rows.map((r) => ({ username: r.username, avatar_url: r.avatar_url || '' })));
};
