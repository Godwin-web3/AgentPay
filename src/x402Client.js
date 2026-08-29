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
  // GatewayClient.pay() returns { data, amount, formattedAmount, transaction, status }.
  // `amount` is raw atomic units (6-decimal USDC) — use `formattedAmount`, the
  // SDK's own decimal string, not `amount.toString()` (a prior version of this
  // wrapper did that, recording e.g. "10000" instead of "0.01" USDC). `transaction`
  // is the real settlement tx hash from the seller's PAYMENT-RESPONSE header
  // (empty string if the seller didn't settle synchronously — Gateway batches
  // settlement, so it isn't always available immediately). There is no `payTo`
  // on this response at all; a prior version of this wrapper read one anyway,
  // which silently always returned undefined.
  return {
    data: response.data,
    actualAmount: response.formattedAmount,
    actualTxHash: response.transaction || null,
  };
}

module.exports = { fetchWithPayment, getGatewayClient };
