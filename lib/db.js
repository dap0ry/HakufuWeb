const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  throw new Error('Falta la variable de entorno DATABASE_URL');
}

// Driver HTTP sin estado — apropiado para funciones serverless (sin pool de
// conexiones que mantener entre invocaciones).
const sql = neon(process.env.DATABASE_URL);

module.exports = { sql };
