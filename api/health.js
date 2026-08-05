const { applyCors } = require('../lib/cors');

module.exports = (req, res) => {
  if (applyCors(req, res)) return;
  res.status(200).json({ status: 'ok' });
};
