// Static route — cannot share a directory level with a dynamic file ([action].js)
// next to the [username] folder (Vercel rejects that as a routing conflict), so
// this one's a plain static file instead.
const { sql } = require('../../lib/db');
const { getCurrentUser } = require('../../lib/auth');
const { applyCors } = require('../../lib/cors');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });

  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  const rows = await sql`
    select f.id, f.requester as "from", u.avatar_url
    from friendships f
    join users u on u.username = f.requester
    where f.recipient = ${me} and f.status = 'pending'
  `;
  return res.status(200).json(rows.map((r) => ({ from: r.from, id: r.id, avatar_url: r.avatar_url || '' })));
};
