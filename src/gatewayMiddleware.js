const { createGatewayMiddleware } = require('@circle-fin/x402-batching/server');

const gateway = createGatewayMiddleware({
  sellerAddress: process.env.AGENT_ADDRESS,
  facilitatorUrl: 'https://gateway-api-testnet.circle.com',
  networks: ['eip155:5042002']
});

module.exports = { gateway };
