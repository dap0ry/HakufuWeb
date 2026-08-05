// El cliente real (la app WPF) no envía preflight ni respeta CORS — esto es
// solo para poder probar los endpoints desde un navegador. Devuelve true si
// ya respondió (petición OPTIONS) y el handler debe cortar ahí.
function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { applyCors };
