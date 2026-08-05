const { sql } = require('../../lib/db');
const { applyCors } = require('../../lib/cors');

function computeCurrentlyReading(lib) {
  const progress = lib.reading_progress || [];
  const mangas = lib.mangas || [];
  if (!progress.length || !mangas.length) return null;

  const latest = [...progress].sort(
    (a, b) => new Date(b.last_read) - new Date(a.last_read)
  )[0];
  const manga = mangas.find((m) => m.id === latest.manga_id);
  if (!manga) return null;

  return {
    manga_title: manga.title || '',
    manga_cover_url: manga.cover_cloudinary_url || '',
    current_page: latest.current_page || 0,
    total_pages: manga.total_pages || 0,
  };
}

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });

  const { username } = req.query;

  const users = await sql`
    select username, bio, avatar_url, created_at, is_profile_public
    from users where username = ${username}
  `;
  const user = users[0];
  if (!user) return res.status(404).json({ detail: 'Usuario no encontrado' });
  if (!user.is_profile_public) return res.status(403).json({ detail: 'Este perfil es privado' });

  const libs = await sql`
    select mangas, reading_history, total_usage_seconds
    from user_libraries where username = ${username}
  `;
  const lib = libs[0] || { mangas: [], reading_history: [], total_usage_seconds: 0 };

  return res.status(200).json({
    username: user.username,
    bio: user.bio || '',
    avatar_url: user.avatar_url || '',
    created_at: user.created_at,
    mangas_count: (lib.mangas || []).length,
    reading_history: lib.reading_history || [],
    total_usage_seconds: Number(lib.total_usage_seconds || 0),
    currently_reading: computeCurrentlyReading(lib),
  });
};
