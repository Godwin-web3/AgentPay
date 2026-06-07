const { createWalletClient, http, parseAbi, encodeFunctionData, decodeFunctionResult } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { 
    publicClient, 
    PLATFORM_ADDRESS, 
    PLATFORM_ABI, 
    RPC_URL 
} = require('./somniaAi');

const JSON_AGENT_ID = 13174292974160097713n;
const PER_NODE_COST = 30000000000000000n; // 0.03 STT
const SUBCOMMITTEE_SIZE = 3n;

const JSON_AGENT_ABI = parseAbi([
    'function get(string url, string selector) external returns (string)'
]);

async function evaluateTrigger(trigger, wallet) {
    if (!trigger) return { met: true };

    console.log(`⛓  Verifying trigger condition on-chain...`);
    console.log(`   Type: ${trigger.type} | Target: ${trigger.query || trigger.repo || trigger.city || trigger.url}`);

    let url = '';
    let selector = '';

    switch (trigger.type) {
        case 'sports':
            url = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(trigger.query)}`;
            selector = trigger.selector || '$.player[0].strHeight'; // Example selector
            break;
        case 'github':
            url = `https://api.github.com/repos/${trigger.repo}/pulls/${trigger.number}`;
            selector = trigger.selector || '$.merged';
            break;
        case 'weather':
            url = `https://wttr.in/${encodeURIComponent(trigger.city)}?format=j1`;
            selector = trigger.selector || '$.current_condition[0].precipMM';
            break;
        case 'onchain':
            url = `https://shannon-explorer.somnia.network/api/v2/addresses/${trigger.address}`;
            selector = trigger.selector || '$.transaction_count';
            break;
        case 'custom':
            url = trigger.url;
            selector = trigger.selector;
            break;
        default:
            throw new Error(`Unsupported trigger type: ${trigger.type}`);
    }

    const privateKey = wallet.privateKey || process.env.PRIVATE_KEY;
    const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
    const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

    try {
        const payload = encodeFunctionData({
            abi: JSON_AGENT_ABI,
            functionName: 'get',
            args: [url, selector]
        });

        const baseDeposit = await publicClient.readContract({
            address: PLATFORM_ADDRESS,
            abi: PLATFORM_ABI,
            functionName: 'getRequestDeposit'
        });

        const totalDeposit = baseDeposit + (PER_NODE_COST * SUBCOMMITTEE_SIZE);

        const hash = await walletClient.writeContract({
            address: PLATFORM_ADDRESS,
            abi: PLATFORM_ABI,
            functionName: 'createRequest',
            args: [JSON_AGENT_ID, '0x0000000000000000000000000000000000000000', '0x00000000', payload],
            value: totalDeposit
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        let requestId;
        for (const log of receipt.logs) {
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
            } catch (e) {}
        }

        if (!requestId) throw new Error('Failed to create trigger request');

        return new Promise((resolve, reject) => {
            const unwatch = publicClient.watchContractEvent({
                address: PLATFORM_ADDRESS,
                abi: PLATFORM_ABI,
                eventName: 'RequestFinalized',
                args: { requestId },
                onLogs: async () => {
                    unwatch();
                    try {
                        const requestData = await publicClient.readContract({
                            address: PLATFORM_ADDRESS,
                            abi: PLATFORM_ABI,
                            functionName: 'getRequest',
                            args: [requestId]
                        });

                        const resultString = decodeFunctionResult({
                            abi: JSON_AGENT_ABI,
                            functionName: 'get',
                            data: requestData.responses[0].result
                        });

                        // Evaluate condition
                        let met = false;
                        const value = isNaN(resultString) ? resultString : Number(resultString);
                        const threshold = isNaN(trigger.threshold) ? trigger.threshold : Number(trigger.threshold);

                        switch (trigger.operator) {
                            case '>': met = value > threshold; break;
                            case '<': met = value < threshold; break;
                            case '>=': met = value >= threshold; break;
                            case '<=': met = value <= threshold; break;
                            case '==': 
                            case '===':
                            case 'equals': met = value == threshold; break;
                            case 'contains': met = String(value).includes(String(threshold)); break;
                            case 'true': met = value === true || value === 'true'; break;
                            default: met = !!value;
                        }

                        resolve({ met, proof: requestId.toString() });
                    } catch (e) {
                        reject(e);
                    }
                }
            });

            setTimeout(() => {
                unwatch();
                reject(new Error('Trigger verification timed out'));
            }, 180000);
        });

    } catch (err) {
        console.error(`❌ Trigger Error: ${err.message}`);
        return { met: false, error: err.message };
    }
}

module.exports = { evaluateTrigger };
