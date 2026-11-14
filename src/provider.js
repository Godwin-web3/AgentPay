const { getProvider } = require('./chain');

// Shared read provider for the active chain. ARC_RPC still overrides Arc.
module.exports = getProvider();
