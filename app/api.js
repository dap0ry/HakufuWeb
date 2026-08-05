// Thin fetch wrapper around the existing /api — shared by app.js, backup.js, reader.js.
const API_BASE = '/api';

export function getToken() { return localStorage.getItem('hakufu_token'); }
export function getUsername() { return localStorage.getItem('hakufu_username'); }

export function setSession(token, username) {
  localStorage.setItem('hakufu_token', token);
  localStorage.setItem('hakufu_username', username);
}

export function clearSession() {
  localStorage.removeItem('hakufu_token');
  localStorage.removeItem('hakufu_username');
}

export function isLoggedIn() { return !!getToken(); }

async function request(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* respuesta vacía o no-JSON */ }

  if (!res.ok) {
    throw new Error((data && data.detail) || `Error ${res.status}`);
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  register: (username, email, password, passwordConfirm) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, password_confirm: passwordConfirm }),
    }),

  getLibrary: () => request('/users/me/library'),

  driveStatus: () => request('/drive/status'),
  driveConnectStart: () => request('/drive/link-start', { method: 'POST' }),
  driveDisconnect: () => request('/drive/disconnect', { method: 'POST' }),
  driveToken: () => request('/drive/token'),
};
