const { createWalletClient, http, webSocket, parseAbi, encodeFunctionData, decodeFunctionResult } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { 
    publicClient, 
    PLATFORM_ADDRESS, 
    PLATFORM_ABI, 
    RPC_URL 
} = require('./somniaAi');

const WS_URL = 'wss://dream-rpc.somnia.network/ws';
const JSON_AGENT_ID = 13174292974160097713n;
const PER_NODE_COST = 30000000000000000n; // 0.03 STT
const SUBCOMMITTEE_SIZE = 3n;

const JSON_AGENT_ABI = parseAbi([
    'function get(string url, string selector) external returns (string)',
    'function fetchUint(string url, string selector, uint8 decimals) external returns (uint256)'
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
        case 'price': {
            const coinId = trigger.coin ? trigger.coin.toLowerCase() : 'bitcoin';
            const cgId = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bitcoin: 'bitcoin', ethereum: 'ethereum', solana: 'solana' }[coinId] || coinId;
            url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + cgId + '&vs_currencies=usd';
            selector = cgId + '.usd';
            trigger._useUint = true;
            trigger._decimals = 2;
            break;
        }
        case 'custom':
            url = trigger.url;
            selector = trigger.selector;
            break;
        default:
            throw new Error(`Unsupported trigger type: ${trigger.type}`);
    }

    // Price triggers: resolve directly via CoinGecko, no on-chain needed
    if (trigger.type === 'price') {
        const coinId = trigger.coin ? trigger.coin.toLowerCase() : 'bitcoin';
        const cgId = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana', bitcoin: 'bitcoin', ethereum: 'ethereum', solana: 'solana' }[coinId] || coinId;
        const https = require('https');
        const price = await new Promise((resolve, reject) => {
            https.get({ hostname: 'api.coingecko.com', path: '/api/v3/simple/price?ids=' + cgId + '&vs_currencies=usd', headers: { 'User-Agent': 'AgentPay/1.0' } }, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => { try { resolve(JSON.parse(d)[cgId].usd); } catch(e) { resolve(null); } });
            }).on('error', reject);
        });
        if (price === null) return { met: false, error: 'Price fetch failed' };
        console.log(`💰 ${coinId.toUpperCase()} price: ${price}`);
        const value = Number(price);
        const threshold = Number(trigger.threshold);
        let met = false;
        switch (trigger.operator) {
            case '>': met = value > threshold; break;
            case '<': met = value < threshold; break;
            case '>=': met = value >= threshold; break;
            case '<=': met = value <= threshold; break;
            case '==': case '===': case 'equals': met = value == threshold; break;
            default: met = !!value;
        }
        console.log(`📊 ${coinId.toUpperCase()} ${value} ${trigger.operator} ${threshold} → ${met ? '✅ met' : '⏳ not met'}`);
        return { met, proof: 'coingecko:' + value };
    }

        const privateKey = wallet.privateKey || process.env.PRIVATE_KEY;
    const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
    const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

    try {
        const payload = trigger._useUint
            ? encodeFunctionData({ abi: JSON_AGENT_ABI, functionName: 'fetchUint', args: [url, selector, trigger._decimals || 2] })
            : encodeFunctionData({ abi: JSON_AGENT_ABI, functionName: 'get', args: [url, selector] });

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
      if (!receipt.logs || receipt.logs.length === 0) throw new Error('No logs in evaluateTrigger receipt');
      // RequestCreated topic: keccak256("RequestCreated(uint256,uint256,uint256,bytes,address[])")
      const REQUEST_CREATED_TOPIC = '0x39a4c66499bcf4b56e6ba4a4873f7a3b8c2da2b3c8f40f44c4c94640a8bcab40';
      const rcLog = receipt.logs.find(l => l.topics[0] && l.topics[0].toLowerCase() === REQUEST_CREATED_TOPIC.toLowerCase());
      console.log('🔍 All log topics[0]:', receipt.logs.map(l => l.topics[0]));
      const requestId = rcLog ? BigInt(rcLog.topics[1]) : BigInt(receipt.logs[0].topics[1]);
      if (!requestId) throw new Error('Failed to create trigger request');

        const { createPublicClient } = require('viem');
        const wsClient = createPublicClient({ transport: webSocket(WS_URL) });
        return new Promise((resolve, reject) => {
            const unwatch = wsClient.watchContractEvent({
                address: PLATFORM_ADDRESS,
                abi: PLATFORM_ABI,
                eventName: 'RequestFinalized',
                onLogs: async (logs) => {
                    const log = logs.find(l => l.args.requestId === requestId);
                    if (!log) return;
                    unwatch();
                    clearTimeout(timeout);
                    try {
                        const req = await publicClient.readContract({
                            address: PLATFORM_ADDRESS,
                            abi: PLATFORM_ABI,
                            functionName: 'getRequest',
                            args: [requestId]
                        });
                            const rawDecoded = trigger._useUint
                                ? Number(decodeFunctionResult({ abi: JSON_AGENT_ABI, functionName: 'fetchUint', data: req.responses[0].result })) / Math.pow(10, trigger._decimals || 2)
                                : decodeFunctionResult({ abi: JSON_AGENT_ABI, functionName: 'get', data: req.responses[0].result });
                            const resultString = String(rawDecoded);
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
                    } catch(e) { reject(e); }
                }
            });
            const timeout = setTimeout(() => {
                unwatch();
                reject(new Error('Trigger verification timed out'));
            }, 180000);
        });
    } catch (err) {
        console.error(`❌ Trigger Error: ${err.message}`);
        return { met: false, error: err.message };
    }
}


const PRICE_MAP = {
  bitcoin: 'bitcoin', btc: 'bitcoin',
  ethereum: 'ethereum', eth: 'ethereum',
  solana: 'solana', sol: 'solana',
  sui: 'sui', bnb: 'binancecoin',
  xrp: 'ripple', doge: 'dogecoin',
  cardano: 'cardano', ada: 'cardano',
  avalanche: 'avalanche-2', avax: 'avalanche-2',
  polkadot: 'polkadot', dot: 'polkadot',
};

async function fetchContext(userInput, wallet) {
  const lower = userInput.toLowerCase();
  const found = Object.keys(PRICE_MAP).find(k => lower.includes(k));
  if (!found) return null;
  const coinId = PRICE_MAP[found];
  try {
    const https = require("https");
    const price = await new Promise((resolve, reject) => {
      https.get({ hostname: "api.coingecko.com", path: "/api/v3/simple/price?ids=" + coinId + "&vs_currencies=usd", headers: { "User-Agent": "AgentPay/1.0" } }, res => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => {
          try { resolve(JSON.parse(d)[coinId] && JSON.parse(d)[coinId].usd); } catch(e) { resolve(null); }
        });
      }).on("error", reject);
    });
    if (!price) return null;
    console.log("💰 " + found.toUpperCase() + " price (CoinGecko): $" + price);
    return { type: "price", coin: found.toUpperCase(), value: Number(price).toFixed(2), proof: "coingecko" };
  } catch(err) {
    console.warn("⚠️  Price fetch failed:", err.message);
    return null;
  }
}

module.exports = { evaluateTrigger, fetchContext };
