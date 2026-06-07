const { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, decodeFunctionResult } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

// Somnia Platform Constants
const PLATFORM_ADDRESS = '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776';
const LLM_AGENT_ID = 12847293847561029384n;
const PER_AGENT_EXECUTION_COST = 700000000000000000n;
const SUBCOMMITTEE_SIZE = 3n;

const RPC_URL = 'https://dream-rpc.somnia.network';

const publicClient = createPublicClient({
    transport: http(RPC_URL)
});

const PLATFORM_ABI = parseAbi([
    'function createRequest(uint256 agentId, address callbackAddress, bytes4 callbackSelector, bytes payload) external payable returns (uint256 requestId)',
    'function getRequestDeposit() external view returns (uint256)',
    'function getRequest(uint256 requestId) external view returns ((uint256 requestId, address sender, uint256 agentId, address callbackAddress, bytes4 callbackSelector, bytes payload, uint256 deposit, uint8 status, (address responder, bytes result)[] responses))',
    'event RequestCreated(uint256 indexed requestId, uint256 indexed agentId, address indexed sender)',
    'event RequestFinalized(uint256 indexed requestId, uint256 indexed agentId)'
]);

const AGENT_ABI = parseAbi([
    'function inferString(string prompt, string system, bool chainOfThought, string[] allowedValues) external returns (string)'
]);

/**
 * Executes a verifiable LLM inference on the Somnia blockchain using viem.
 * @param {string} prompt The user's prompt
 * @param {string} system The system instructions
 * @param {object} wallet The wallet object (expects privateKey property or similar)
 * @returns {Promise<string>} The AI's response after decentralized consensus
 */
async function inferOnChain(prompt, system = "You are a helpful assistant.", wallet) {
    // Extract private key from ethers wallet or use from env
    const privateKey = wallet.privateKey || process.env.PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("Private key required for on-chain inference");
    }

    const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
    
    const walletClient = createWalletClient({
        account,
        transport: http(RPC_URL)
    });

    console.log(`📡 Creating on-chain AI request (Agent ID: ${LLM_AGENT_ID})...`);

    try {
        // 1. Encode the call to the agent: inferString(prompt, system, chainOfThought, allowedValues)
        const payload = encodeFunctionData({
            abi: AGENT_ABI,
            functionName: 'inferString',
            args: [prompt, system, false, []]
        });

        // 2. Calculate Deposit
        const baseDeposit = await publicClient.readContract({
            address: PLATFORM_ADDRESS,
            abi: PLATFORM_ABI,
            functionName: 'getRequestDeposit'
        });

        const totalDeposit = baseDeposit + (PER_AGENT_EXECUTION_COST * SUBCOMMITTEE_SIZE);
        console.log(`💰 Calculated deposit: ${totalDeposit.toString()} wei`);

        // 3. Create Request
        const hash = await walletClient.writeContract({
            address: PLATFORM_ADDRESS,
            abi: PLATFORM_ABI,
            functionName: 'createRequest',
            args: [LLM_AGENT_ID, '0x0000000000000000000000000000000000000000', '0x00000000', payload],
            value: totalDeposit
        });

        console.log(`⏳ Transaction sent: ${hash}. Waiting for receipt...`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        // Extract requestId from RequestCreated event
        const logs = receipt.logs;
        // In viem, we can use decodeEventLog or just find the event by topic
        // But since we have the ABI, we can parse it.
        // RequestCreated(uint256 requestId, uint256 agentId, address sender)
        // Usually requestId is the first param.
        
        let requestId;
        for (const log of logs) {
            try {
                const event = publicClient.decodeEventLog({
                    abi: PLATFORM_ABI,
                    data: log.data,
                    topics: log.topics
                });
                if (event.eventName === 'RequestCreated') {
                    requestId = event.args.requestId;
                    break;
                }
            } catch (e) {
                // Ignore logs that don't match
            }
        }

        if (!requestId) {
            throw new Error('RequestCreated event not found in transaction receipt');
        }

        console.log(`✨ Request Created! ID: ${requestId}. Waiting for Somnia consensus (RequestFinalized)...`);

        // 4. Wait for RequestFinalized event
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                unwatch();
                reject(new Error('Timeout waiting for Somnia on-chain AI response (5m)'));
            }, 300000); // 5 minute timeout

            const unwatch = publicClient.watchContractEvent({
                address: PLATFORM_ADDRESS,
                abi: PLATFORM_ABI,
                eventName: 'RequestFinalized',
                args: { requestId },
                onLogs: async (logs) => {
                    clearTimeout(timeout);
                    unwatch();
                    console.log('✅ Request Finalized! Fetching results...');
                    
                    try {
                        // 5. Get Request and Decode Result
                        const requestData = await publicClient.readContract({
                            address: PLATFORM_ADDRESS,
                            abi: PLATFORM_ABI,
                            functionName: 'getRequest',
                            args: [requestId]
                        });

                        const responses = requestData.responses;
                        if (!responses || responses.length === 0) {
                            throw new Error('No responses found in finalized request');
                        }

                        const firstResponse = responses[0].result;
                        const decoded = decodeFunctionResult({
                            abi: AGENT_ABI,
                            functionName: 'inferString',
                            data: firstResponse
                        });

                        resolve(decoded);
                    } catch (e) {
                        reject(new Error('Failed to decode response data: ' + e.message));
                    }
                }
            });
        });

    } catch (error) {
        console.error('❌ Somnia AI Error:', error.message);
        throw error;
    }
}

module.exports = { 
    inferOnChain, 
    publicClient, 
    PLATFORM_ADDRESS, 
    PLATFORM_ABI, 
    RPC_URL 
};
