const { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, decodeFunctionResult } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

const PLATFORM_ADDRESS = '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776';
const LLM_AGENT_ID = 12847293847561029384n;
const SUBCOMMITTEE_SIZE = 3n;
const RPC_URL = 'https://dream-rpc.somnia.network';

const publicClient = createPublicClient({ transport: http(RPC_URL) });

const PLATFORM_ABI = parseAbi([
    'function createRequest(uint256 agentId, address callbackAddress, bytes4 callbackSelector, bytes calldata payload) external payable returns (uint256 requestId)',
    'function getRequestDeposit() external view returns (uint256)',
    'function getRequest(uint256 requestId) external view returns ((uint256 id, address requester, address callbackAddress, bytes4 callbackSelector, address[] subcommittee, (address validator, bytes result, uint8 status, uint256 receipt, uint256 timestamp, uint256 executionCost)[] responses, uint256 responseCount, uint256 failureCount, uint256 threshold, uint256 createdAt, uint256 deadline, uint8 status, uint8 consensusType, uint256 remainingBudget, uint256 perAgentBudget) request)',
    'event RequestCreated(uint256 indexed requestId, uint256 indexed agentId, uint256 perAgentBudget, bytes payload, address[] subcommittee)',
    'event RequestFinalized(uint256 indexed requestId, uint8 status)'
]);

const AGENT_ABI = parseAbi([
    'function inferString(string prompt, string system, bool chainOfThought, string[] allowedValues) external returns (string)'
]);

async function inferOnChain(prompt, system = "You are a helpful assistant.", wallet) {
    const privateKey = (wallet && wallet.privateKey) || process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("Private key required for on-chain inference");

    const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
    const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

    console.log(`📡 Creating on-chain AI request (Agent ID: ${LLM_AGENT_ID})...`);

    try {
        const payload = encodeFunctionData({
            abi: AGENT_ABI,
            functionName: 'inferString',
            args: [prompt, system, false, []]
        });

        let totalDeposit = 240000000000000000n; // Default 0.24 STT
        try {
            const minDeposit = await publicClient.readContract({
                address: PLATFORM_ADDRESS,
                abi: PLATFORM_ABI,
                functionName: 'getRequestDeposit'
            });
            console.log(`📊 Platform required deposit: ${minDeposit.toString()} wei (${(Number(minDeposit) / 1e18).toFixed(4)} STT)`);
            if (minDeposit > totalDeposit) {
                totalDeposit = minDeposit;
            }
        } catch (e) {
            console.warn('⚠️ Could not fetch min deposit from platform, using default');
        }

        console.log(`💰 Using deposit: ${totalDeposit.toString()} wei (${(Number(totalDeposit) / 1e18).toFixed(4)} STT)`);

        const hash = await walletClient.writeContract({
            address: PLATFORM_ADDRESS,
            abi: PLATFORM_ABI,
            functionName: 'createRequest',
            args: [LLM_AGENT_ID, process.env.VAULT_ADDRESS, '0x387e0801', payload],
            value: totalDeposit
        });

        console.log(`⏳ Transaction sent: ${hash}. Waiting for receipt...`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        if (!receipt.logs || receipt.logs.length === 0) throw new Error('No logs in transaction receipt');
        const requestId = BigInt(receipt.logs[0].topics[1]);
        const startBlock = receipt.blockNumber;
        const reqIdHex = '0x' + requestId.toString(16).padStart(64, '0');

        // Register inference on vault so it tracks the callback
        const VAULT_ABI = parseAbi([
            'function registerInference(uint256 requestId, address requester) external',
            'event InferenceResult(uint256 indexed requestId, address indexed requester, bytes result, bool success)'
        ]);
        await walletClient.writeContract({
            address: process.env.VAULT_ADDRESS,
            abi: VAULT_ABI,
            functionName: 'registerInference',
            args: [requestId, account.address]
        });

        console.log(`✨ Request Created! ID: ${requestId}. Waiting for Somnia consensus...`);

        return new Promise((resolve, reject) => {
            const startBlock = receipt.blockNumber;
            // Poll for event directly as fallback
            const pollInterval = setInterval(async () => {
                try {
                    const logs = await publicClient.getContractEvents({
                        address: process.env.VAULT_ADDRESS,
                        abi: parseAbi(['event InferenceResult(uint256 indexed requestId, address indexed requester, bytes result, bool success)']),
                        eventName: 'InferenceResult',
                        args: { requestId },
                        fromBlock: startBlock,
                        toBlock: 'latest'
                    });
                    if (logs.length > 0) {
                        clearInterval(pollInterval);
                        clearTimeout(timeout);
                        if (unwatch) unwatch();
                        const log = logs[0];
                        try {
                            const result = decodeFunctionResult({ abi: AGENT_ABI, functionName: 'inferString', data: log.args.result });
                            console.log('✅ Inference Result Received!');
                            console.log('🔗 Proof: https://shannon-explorer.somnia.network/tx/' + log.transactionHash);
                            resolve({ result, requestId: requestId.toString() });
                        } catch (e) { reject(new Error('Failed to decode response: ' + e.message)); }
                    }
                } catch(e) {}
            }, 15000);
            const timeout = setTimeout(() => {
                clearInterval(pollInterval);
                if (unwatch) unwatch();
                reject(new Error('Timeout waiting for Somnia on-chain AI response (5m)'));
            }, 300000);

            const unwatch = publicClient.watchContractEvent({
                address: process.env.VAULT_ADDRESS,
                abi: parseAbi(['event InferenceResult(uint256 indexed requestId, address indexed requester, bytes result, bool success)']),
                eventName: 'InferenceResult',
                args: { requestId },
                onLogs: (logs) => {
                    clearTimeout(timeout);
                    if (unwatch) unwatch();
                    const log = logs[0];
                    console.log('✅ Inference Result Received!');
                    console.log('🔗 Proof: https://shannon-explorer.somnia.network/tx/' + log.transactionHash);
                    
                    if (!log.args.success) {
                        return reject(new Error('On-chain inference reported failure'));
                    }

                    try {
                        const result = decodeFunctionResult({
                            abi: AGENT_ABI,
                            functionName: 'inferString',
                            data: log.args.result
                        });
                        resolve({ result, requestId: requestId.toString() });
                    } catch (e) {
                        reject(new Error('Failed to decode response: ' + e.message));
                    }
                }
            });
        });

    } catch (error) {
        console.error('❌ Somnia AI Error:', error.message);
        throw error;
    }
}

module.exports = { inferOnChain, publicClient, PLATFORM_ADDRESS, PLATFORM_ABI, RPC_URL };
