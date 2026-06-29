const { HermesClient } = require("@pythnetwork/hermes-client");
require('dotenv').config();

const connection = new HermesClient("https://hermes.pyth.network", {});

// Pyth Price IDs for common assets
const PYTH_PRICE_IDS = {
  bitcoin: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ethereum: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  solana: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  usdc: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
};

/**
 * Evaluates a trigger condition using Arc-native oracles (Pyth) or off-chain data.
 */
async function evaluateTrigger(trigger) {
    if (!trigger) return { met: true };

    console.log(`⛓  Evaluating trigger condition (Arc-Native)...`);
    console.log(`   Type: ${trigger.type} | Target: ${trigger.query || trigger.repo || trigger.city || trigger.url || trigger.coin}`);

    switch (trigger.type) {
        case 'price':
            return await evaluatePriceTrigger(trigger);
        case 'github':
            return await evaluateGithubTrigger(trigger);
        case 'weather':
            return await evaluateWeatherTrigger(trigger);
        case 'custom':
            return await evaluateCustomTrigger(trigger);
        default:
            throw new Error(`Unsupported trigger type: ${trigger.type}`);
    }
}

async function evaluatePriceTrigger(trigger) {
    const coinId = trigger.coin ? trigger.coin.toLowerCase() : 'bitcoin';
    const pythId = PYTH_PRICE_IDS[coinId];

    if (!pythId) {
        // Fallback to human-readable lookup if not in our map
        console.log(`⚠️  Pyth ID for ${coinId} not found, using CoinGecko fallback...`);
        return await evaluatePriceFallback(trigger);
    }

    try {
        const priceUpdates = await connection.getLatestPriceUpdates([pythId]);
        if (!priceUpdates || !priceUpdates.parsed || priceUpdates.parsed.length === 0) throw new Error("No Pyth data");

        const priceData = priceUpdates.parsed[0].price;
        const price = Number(priceData.price) * Math.pow(10, priceData.expo);
        
        console.log(`🔮 Pyth Oracle Price (${coinId.toUpperCase()}): $${price.toFixed(2)}`);
        
        const threshold = Number(trigger.threshold);
        let met = false;
        switch (trigger.operator) {
            case '>': met = price > threshold; break;
            case '<': met = price < threshold; break;
            case '>=': met = price >= threshold; break;
            case '<=': met = price <= threshold; break;
            case '==': met = Math.abs(price - threshold) < 0.01; break;
            default: met = false;
        }

        return { met, proof: `pyth:${priceData.publish_time}:${price}` };
    } catch (err) {
        console.error(`❌ Pyth Error: ${err.message}. Falling back...`);
        return await evaluatePriceFallback(trigger);
    }
}

async function evaluatePriceFallback(trigger) {
    const coinId = trigger.coin ? trigger.coin.toLowerCase() : 'bitcoin';
    const https = require('https');
    const price = await new Promise((resolve) => {
        https.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`, {
            headers: { 'User-Agent': 'AgentPay-Arc/1.0' }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)[coinId].usd); } catch(e) { resolve(null); } });
        }).on('error', () => resolve(null));
    });

    if (price === null) return { met: false, error: 'Price fetch failed' };
    
    const threshold = Number(trigger.threshold);
    let met = false;
    switch (trigger.operator) {
        case '>': met = price > threshold; break;
        case '<': met = price < threshold; break;
        case '==': met = price == threshold; break;
        default: met = false;
    }
    return { met, proof: 'coingecko:' + price };
}

async function evaluateGithubTrigger(trigger) {
    const https = require('https');
    const data = await new Promise((resolve) => {
        https.get(`https://api.github.com/repos/${trigger.repo}/pulls/${trigger.number}`, {
            headers: { 'User-Agent': 'AgentPay-Arc/1.0' }
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } });
        }).on('error', () => resolve(null));
    });

    if (!data) return { met: false, error: 'GitHub fetch failed' };
    
    const isMerged = data.merged === true;
    const met = trigger.condition === 'merged' ? isMerged : !isMerged;
    
    return { met, proof: `github:${data.id}:${isMerged}` };
}

async function evaluateWeatherTrigger(trigger) {
    const https = require('https');
    const data = await new Promise((resolve) => {
        https.get(`https://wttr.in/${encodeURIComponent(trigger.city)}?format=j1`, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } });
        }).on('error', () => resolve(null));
    });

    if (!data) return { met: false, error: 'Weather fetch failed' };
    
    const precip = Number(data.current_condition[0].precipMM);
    const met = precip > (Number(trigger.threshold) || 0);
    
    return { met, proof: `weather:${precip}mm` };
}

async function evaluateCustomTrigger(trigger) {
    // Basic JSON API check
    const https = require('https');
    const data = await new Promise((resolve) => {
        https.get(trigger.url, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
        }).on('error', () => resolve(null));
    });

    if (!data) return { met: false, error: 'Custom API fetch failed' };
    
    // Simple equality check for now
    return { met: true, proof: 'api_response_received' };
}

/**
 * Fetches context for the LLM brain (e.g. current prices)
 */
async function fetchContext(userInput) {
    const lower = userInput.toLowerCase();
    const assets = ['bitcoin', 'ethereum', 'solana', 'usdc'];
    const found = assets.find(a => lower.includes(a));
    if (!found) return null;

    try {
        const pythId = PYTH_PRICE_IDS[found];
        const priceUpdates = await connection.getLatestPriceUpdates([pythId]);
        const priceData = priceUpdates.parsed[0].price;
        const price = Number(priceData.price) * Math.pow(10, priceData.expo);
        
        return { type: "price", coin: found.toUpperCase(), value: price.toFixed(2), proof: "pyth" };
    } catch (err) {
        return null;
    }
}

module.exports = { evaluateTrigger, fetchContext };
