const { buildConsentUrl } = require('../../../lib/google');

// Público a propósito — este endpoint solo redirige a Google. La identidad real
// se resuelve en el callback a partir de `state`, que es un link_code de un solo
// uso ya asociado a un username (ver /api/drive/connect/start).
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ detail: 'Method not allowed' });

  const { state } = req.query;
  if (!state) return res.status(400).json({ detail: 'Falta el parámetro state' });

  let url;
  try {
    url = buildConsentUrl(state);
  } catch (err) {
    return res.status(500).json({ detail: err.message });
  }

  res.writeHead(302, { Location: url });
  res.end();
};
