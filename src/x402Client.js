const { wrapFetchWithPayment } = require('@x402/fetch');
const walletService = require('./walletService');

async function fetchWithPayment(url, walletId, options = {}) {
  const address = await walletService.getWalletAddress(walletId);
  let actualAmount = 0;
  let actualPayTo = null;

  const signer = async (paymentRequired) => {
    const accept = paymentRequired.accepts[0];
    actualAmount = parseFloat(accept.maxAmountRequired);
    actualPayTo = accept.payTo;

    const txId = await walletService.sendUSDC(walletId, actualPayTo, actualAmount);
    console.log(`[x402] Paid ${actualAmount} USDC | to: ${actualPayTo} | tx: ${txId}`);

    return {
      x402Version: 1,
      scheme: 'exact',
      network: 'eip155:5042002',
      payload: { txHash: txId },
      from: address
    };
  };

  const wrappedFetch = wrapFetchWithPayment(fetch, signer);
  const response = await wrappedFetch(url, { method: 'GET', ...options });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  return { data, actualAmount, actualPayTo };
}

module.exports = { fetchWithPayment };
