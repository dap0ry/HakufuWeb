// Thin wrappers around Dropbox's OAuth + token endpoints. No SDK — just fetch.
// Mirrors lib/google.js's shape closely; Dropbox's OAuth2 flow is structurally
// the same (authorization_code exchange, refresh_token grant).
const AUTH_URL   = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL  = 'https://api.dropboxapi.com/oauth2/token';
const REVOKE_URL = 'https://api.dropboxapi.com/2/auth/token/revoke';

const APP_KEY      = process.env.DROPBOX_APP_KEY;
const APP_SECRET   = process.env.DROPBOX_APP_SECRET;
const REDIRECT_URI = process.env.DROPBOX_REDIRECT_URI;

function requireConfig() {
  if (!APP_KEY || !APP_SECRET || !REDIRECT_URI) {
    throw new Error(
      'Faltan DROPBOX_APP_KEY / DROPBOX_APP_SECRET / DROPBOX_REDIRECT_URI'
    );
  }
}

function buildConsentUrl(state) {
  requireConfig();
  const params = new URLSearchParams({
    client_id: APP_KEY,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    token_access_type: 'offline', // pide refresh_token, igual que access_type=offline en Google
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  requireConfig();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: APP_KEY,
      client_secret: APP_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Error de OAuth');
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function refreshAccessToken(refreshToken) {
  requireConfig();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: APP_KEY,
      client_secret: APP_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Error refrescando el token');
  return data; // { access_token, expires_in, ... } — sin nuevo refresh_token
}

// A diferencia de Google (que revoca cualquier token que le pases como
// parámetro), el endpoint de revocación de Dropbox revoca el token que se usa
// para AUTENTICAR la propia llamada — así que hay que pedir un access_token
// fresco a partir del refresh_token guardado, y revocar ESE.
async function revokeToken(refreshToken) {
  try {
    const { access_token } = await refreshAccessToken(refreshToken);
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}` },
    });
  } catch { /* best-effort — igualmente borramos la conexión localmente */ }
}

module.exports = { buildConsentUrl, exchangeCodeForTokens, refreshAccessToken, revokeToken };
