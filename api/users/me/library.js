const { sql } = require('../../../lib/db');
const { getCurrentUser } = require('../../../lib/auth');
const { applyCors } = require('../../../lib/cors');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const me = getCurrentUser(req);
  if (!me) return res.status(401).json({ detail: 'Token inválido o expirado' });

  if (req.method === 'GET') {
    const rows = await sql`
      select mangas, collections, reading_progress, reading_history, total_usage_seconds
      from user_libraries where username = ${me}
    `;
    if (!rows.length) return res.status(404).json({ detail: 'No hay datos sincronizados' });
    const lib = rows[0];
    return res.status(200).json({
      mangas: lib.mangas || [],
      collections: lib.collections || [],
      reading_progress: lib.reading_progress || [],
      reading_history: lib.reading_history || [],
      total_usage_seconds: Number(lib.total_usage_seconds || 0),
    });
  }

  if (req.method === 'PUT') {
    const body = req.body || {};
    const mangas = Array.isArray(body.mangas) ? body.mangas : [];
    const collections = Array.isArray(body.collections) ? body.collections : [];
    const readingProgress = Array.isArray(body.reading_progress) ? body.reading_progress : [];
    const readingHistory = Array.isArray(body.reading_history) ? body.reading_history : [];
    const totalUsageSeconds = Number.isFinite(body.total_usage_seconds) ? body.total_usage_seconds : 0;

    await sql`
      insert into user_libraries
        (username, mangas, collections, reading_progress, reading_history, total_usage_seconds, updated_at)
      values
        (${me}, ${JSON.stringify(mangas)}, ${JSON.stringify(collections)},
         ${JSON.stringify(readingProgress)}, ${JSON.stringify(readingHistory)},
         ${totalUsageSeconds}, now())
      on conflict (username) do update set
        mangas               = excluded.mangas,
        collections          = excluded.collections,
        reading_progress     = excluded.reading_progress,
        reading_history      = excluded.reading_history,
        total_usage_seconds  = excluded.total_usage_seconds,
        updated_at           = now()
    `;
    return res.status(204).end();
  }

  return res.status(405).json({ detail: 'Method not allowed' });
};
