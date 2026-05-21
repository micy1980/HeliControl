const os = require('node:os');
const { PORT } = require('./config');

function getLanUrls(port = PORT) {
  const urls = [];
  const nets = os.networkInterfaces();
  Object.values(nets).flat().filter(Boolean).forEach((net) => {
    if (net.family === 'IPv4' && !net.internal) urls.push(`http://${net.address}:${port}`);
  });
  return urls;
}

module.exports = {
  getLanUrls,
};
