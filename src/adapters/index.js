const { ExecutionAdapter } = require('./ExecutionAdapter');
const { DirectUSDCAdapter } = require('./DirectUSDCAdapter');
const { SwapAdapter } = require('./SwapAdapter');
const { CrossNetworkAdapter } = require('./CrossNetworkAdapter');

const adapters = [
  new DirectUSDCAdapter(),
  new SwapAdapter(),
  new CrossNetworkAdapter(),
];

function getAdaptersFor(intent) {
  return adapters.filter(a => a.supports(intent));
}

module.exports = {
  ExecutionAdapter,
  DirectUSDCAdapter,
  SwapAdapter,
  CrossNetworkAdapter,
  adapters,
  getAdaptersFor,
};
