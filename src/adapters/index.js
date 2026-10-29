const { ExecutionAdapter } = require('./ExecutionAdapter');
const { DirectUSDCAdapter } = require('./DirectUSDCAdapter');

const adapters = [
  new DirectUSDCAdapter(),
];

function getAdaptersFor(intent) {
  return adapters.filter(a => a.supports(intent));
}

module.exports = { ExecutionAdapter, DirectUSDCAdapter, adapters, getAdaptersFor };
