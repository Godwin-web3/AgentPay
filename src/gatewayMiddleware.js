const { createGatewayMiddleware } = require('@circle-fin/x402-batching/server');
const { getChain } = require('./chain');

const chain = getChain();

const gateway = createGatewayMiddleware({
  sellerAddress: process.env.AGENT_ADDRESS,
  facilitatorUrl: chain.id === 'arc'
    ? 'https://gateway-api-testnet.circle.com'
    : (process.env.X402_FACILITATOR_URL || 'https://gateway-api-testnet.circle.com'),
  networks: [`eip155:${chain.chainId}`]
});

module.exports = { gateway };
