require('dotenv').config();
const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');
const { createPublicClient, http, keccak256, toHex, decodeEventLog } = require('viem');
const { toUnits, fromUnits } = require('../utils/usdc');

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET
});

const AGENTIC_COMMERCE_CONTRACT = '0x0747EEf0706327138c69792bF28Cd525089e4583';
const USDC_CONTRACT = process.env.USDC_CONTRACT;

const { setGlobalDispatcher, Agent } = require('undici');
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
const publicClient = createPublicClient({
  chain: {
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [process.env.ARC_RPC] } }
  },
  transport: http(process.env.ARC_RPC)
});

const agenticCommerceAbi = [
  {
    type: 'function', name: 'createJob', stateMutability: 'nonpayable',
    inputs: [
      { name: 'provider', type: 'address' },
      { name: 'evaluator', type: 'address' },
      { name: 'expiredAt', type: 'uint256' },
      { name: 'description', type: 'string' },
      { name: 'hook', type: 'address' }
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }]
  },
  {
    type: 'function', name: 'setBudget', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
      { name: 'optParams', type: 'bytes' }
    ], outputs: []
  },
  {
    type: 'function', name: 'fund', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'optParams', type: 'bytes' }
    ], outputs: []
  },
  {
    type: 'function', name: 'submit', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'deliverable', type: 'bytes32' },
      { name: 'optParams', type: 'bytes' }
    ], outputs: []
  },
  {
    type: 'function', name: 'complete', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'reason', type: 'bytes32' },
      { name: 'optParams', type: 'bytes' }
    ], outputs: []
  },
  {
    type: 'function', name: 'reject', stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'reason', type: 'bytes32' },
      { name: 'optParams', type: 'bytes' }
    ], outputs: []
  },
  {
    type: 'function', name: 'getJob', stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'id', type: 'uint256' },
        { name: 'client', type: 'address' },
        { name: 'provider', type: 'address' },
        { name: 'evaluator', type: 'address' },
        { name: 'description', type: 'string' },
        { name: 'budget', type: 'uint256' },
        { name: 'expiredAt', type: 'uint256' },
        { name: 'status', type: 'uint8' },
        { name: 'hook', type: 'address' }
      ]
    }]
  },
  {
    type: 'event', name: 'JobCreated', anonymous: false,
    inputs: [
      { indexed: true, name: 'jobId', type: 'uint256' },
      { indexed: true, name: 'client', type: 'address' },
      { indexed: true, name: 'provider', type: 'address' },
      { indexed: false, name: 'evaluator', type: 'address' },
      { indexed: false, name: 'expiredAt', type: 'uint256' },
      { indexed: false, name: 'hook', type: 'address' }
    ]
  }
];

const STATUS_NAMES = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'];

async function waitForTx(txId, label) {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await client.getTransaction({ id: txId });
    const tx = check.data?.transaction;
    if (tx?.txHash && tx?.state === 'COMPLETE') return tx.txHash;
    if (tx?.state === 'FAILED') throw new Error(label + ' failed onchain');
  }
  throw new Error(label + ' timed out');
}

async function contractCall(walletId, contractAddress, abiFunctionSignature, abiParameters, label) {
  console.log("CONTRACT_CALL:", label, JSON.stringify({abiFunctionSignature, abiParameters}));
  const res = await client.createContractExecutionTransaction({
    walletId,
    contractAddress,
    blockchain: 'ARC-TESTNET',
    abiFunctionSignature,
    abiParameters,
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });
  return await waitForTx(res.data.id, label);
}

async function extractJobId(txHash) {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: agenticCommerceAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === 'JobCreated') return decoded.args.jobId;
    } catch { continue; }
  }
  throw new Error('Could not parse JobCreated event');
}

async function createJob(clientWalletId, providerAddress, evaluatorAddress, description, expirySeconds = 3600) {
  const expiredAt = Math.floor(Date.now() / 1000) + expirySeconds;
  const txHash = await contractCall(
    clientWalletId,
    AGENTIC_COMMERCE_CONTRACT,
    'createJob(address,address,uint256,string,address)',
    [providerAddress, evaluatorAddress, expiredAt.toString(), description, '0x0000000000000000000000000000000000000000'],
    'create job'
  );
  const jobId = await extractJobId(txHash);
  return { jobId: jobId.toString(), txHash };
}

async function setBudget(providerWalletId, jobId, amountUSDC) {
  const amountRaw = toUnits(amountUSDC).toString();
  return await contractCall(
    providerWalletId, AGENTIC_COMMERCE_CONTRACT,
    'setBudget(uint256,uint256,bytes)',
    [jobId, amountRaw, '0x'], 'set budget'
  );
}

async function approveAndFund(clientWalletId, jobId, amountUSDC) {
  const amountRaw = toUnits(amountUSDC).toString();
  await contractCall(
    clientWalletId, USDC_CONTRACT,
    'approve(address,uint256)',
    [AGENTIC_COMMERCE_CONTRACT, amountRaw], 'approve USDC'
  );
  return await contractCall(
    clientWalletId, AGENTIC_COMMERCE_CONTRACT,
    'fund(uint256,bytes)',
    [jobId, '0x'], 'fund escrow'
  );
}

async function submitDeliverable(providerWalletId, jobId, deliverableText) {
  const deliverableHash = keccak256(toHex(deliverableText));
  const txHash = await contractCall(
    providerWalletId, AGENTIC_COMMERCE_CONTRACT,
    'submit(uint256,bytes32,bytes)',
    [jobId, deliverableHash, '0x'], 'submit deliverable'
  );
  return { txHash, deliverableHash };
}

async function completeJob(evaluatorWalletId, jobId, reasonText = 'deliverable-approved') {
  const reasonHash = keccak256(toHex(reasonText));
  return await contractCall(
    evaluatorWalletId, AGENTIC_COMMERCE_CONTRACT,
    'complete(uint256,bytes32,bytes)',
    [jobId, reasonHash, '0x'], 'complete job'
  );
}

async function rejectJob(evaluatorWalletId, jobId, reasonText = 'deliverable-rejected') {
  const reasonHash = keccak256(toHex(reasonText));
  return await contractCall(
    evaluatorWalletId, AGENTIC_COMMERCE_CONTRACT,
    'reject(uint256,bytes32,bytes)',
    [jobId, reasonHash, '0x'], 'reject job'
  );
}

async function getJob(jobId) {
  const job = await publicClient.readContract({
    address: AGENTIC_COMMERCE_CONTRACT,
    abi: agenticCommerceAbi,
    functionName: 'getJob',
    args: [jobId]
  });
  return {
    id: job.id.toString(),
    client: job.client,
    provider: job.provider,
    evaluator: job.evaluator,
    description: job.description,
    budget: String(fromUnits(job.budget)),
    status: STATUS_NAMES[Number(job.status)],
    expiredAt: job.expiredAt.toString()
  };
}

async function getRecentJobs() {
  const logs = await publicClient.getLogs({
    address: AGENTIC_COMMERCE_CONTRACT,
    event: agenticCommerceAbi.find(a => a.type === 'event' && a.name === 'JobCreated'),
    fromBlock: 0n,
    toBlock: 'latest'
  });
  const jobIds = [...new Set(logs.map(l => l.args.jobId))];
  const jobs = [];
  for (const id of jobIds) {
    try {
      const job = await getJob(id);
      if (job.client !== '0x0000000000000000000000000000000000000000') {
        jobs.push({
          ...job,
          budget: Number(job.budget).toFixed(2),
          description: job.description.slice(0, 80)
        });
      }
    } catch { }
  }
  jobs.sort((a, b) => Number(b.id) - Number(a.id));
  return jobs;
}

module.exports = {
  createJob, setBudget, approveAndFund, submitDeliverable, completeJob, rejectJob, getJob, getRecentJobs
};
