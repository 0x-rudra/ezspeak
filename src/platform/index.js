const os = require('os');

function getPlatformAdapter() {
  switch (process.platform) {
    case 'linux':
      return require('./linux');
    case 'win32':
      return require('./windows');
    default:
      return require('./linux');
  }
}

module.exports = getPlatformAdapter();

