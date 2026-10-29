/**
 * Transaction status helper
 *
 * Distinguishes submitted / included / confirmed without authorizing anything.
 * Use after a vault execution or external tx submission.
 */

async function getTxStatus(provider, txHash) {
  if (!txHash) return { status: 'unknown', reason: 'no hash' };

  const tx = await provider.getTransaction(txHash);
  if (!tx) return { status: 'submitted', txHash }; // not yet seen by node

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) return { status: 'included', txHash, blockNumber: tx.blockNumber };

  return {
    status: receipt.status === 1 ? 'confirmed' : 'failed',
    txHash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed?.toString(),
  };
}

module.exports = { getTxStatus };
