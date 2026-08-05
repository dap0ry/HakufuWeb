const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE_SECONDS = 60 * 60 * 24 * 30; // 30 días — igual que la API anterior

if (!JWT_SECRET) {
  throw new Error('Falta la variable de entorno JWT_SECRET');
}

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function makeToken(username) {
  return jwt.sign({ sub: username }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: JWT_EXPIRE_SECONDS,
  });
}

// Devuelve el username del portador del token, o null si falta/es inválido/expiró.
// Los handlers deciden si eso es un 401 (nunca lanza).
function getCurrentUser(req) {
  const header = req.headers['authorization'] || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, makeToken, getCurrentUser };
