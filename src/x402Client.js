require('dotenv').config();
const { GatewayClient } = require('@circle-fin/x402-batching/client');

let _client = null;

function getGatewayClient() {
  if (!_client) {
    _client = new GatewayClient({
      chain: 'arcTestnet',
      privateKey: process.env.PRIVATE_KEY,
    });
  }
  return _client;
}

async function fetchWithPayment(url, walletId, options = {}, payerAddress = null) {
  const client = getGatewayClient();
  const response = await client.pay(url, options);
  return { data: response.data, actualAmount: response.amount?.toString(), actualPayTo: response.payTo };
}

module.exports = { fetchWithPayment, getGatewayClient };
