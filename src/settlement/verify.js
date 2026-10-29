/**
 * Settlement verification
 *
 * Matches an off-chain receipt (from an adapter or PaymentRequest) against
 * the on-chain AgentVault Executed event for the same requestId.
 * This does not move funds. It only checks what already happened.
 */

async function verifySettlement({
  requestId,
  expectedTo,
  expectedAmount,
  vaultContract, // ethers Contract instance for AgentVault
  fromBlock = 0,
}) {
  if (!requestId || !vaultContract) {
    return { verified: false, reason: 'missing requestId or vault' };
  }

  const filter = vaultContract.filters.Executed(null, expectedTo || null, null, null, requestId);
  const events = await vaultContract.queryFilter(filter, fromBlock);

  if (events.length === 0) {
    return { verified: false, reason: 'no Executed event for requestId' };
  }

  const event = events[events.length - 1];
  const { user, to, amount, reason, requestId: eventRequestId } = event.args;

  const amountMatch = expectedAmount == null || amount.toString() === expectedAmount.toString();
  const toMatch = !expectedTo || to.toLowerCase() === expectedTo.toLowerCase();

  return {
    verified: amountMatch && toMatch,
    requestId: eventRequestId,
    user,
    to,
    amount: amount.toString(),
    reason,
    blockNumber: event.blockNumber,
    txHash: event.transactionHash,
    amountMatch,
    toMatch,
  };
}

module.exports = { verifySettlement };
