// One-off helper: applies db/schema.sql to DATABASE_URL. Not deployed (db/ isn't under api/).
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

function loadEnvLocal() {
  const file = path.join(__dirname, '..', '.env.local');
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let value = m[2].trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    process.env[m[1]] = value;
  }
}

async function main() {
  loadEnvLocal();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const sql = neon(process.env.DATABASE_URL);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  // Strip full-line comments first — splitting on ";\n" alone leaves them stuck to
  // the front of the next statement's chunk, so a naive startsWith('--') filter
  // drops the real statement along with its leading comment.
  const withoutComments = schema
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = withoutComments
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length);

  for (const stmt of statements) {
    await sql(stmt);
    console.log('OK:', stmt.split('\n')[0].slice(0, 70));
  }
  console.log('Schema applied.');
}

main().catch((err) => { console.error(err); process.exit(1); });
