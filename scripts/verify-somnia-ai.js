require('dotenv').config();
const { ethers } = require('ethers');
const { inferOnChain } = require('../src/somniaAi');

async function main() {
    console.log('🧪 Verifying Somnia On-Chain AI Integration...');

    const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const prompt = "What is the capital of Italy?";
    const system = "You are a helpful assistant. Keep it short.";

    try {
        const result = await inferOnChain(prompt, system, wallet);
        console.log('🤖 Verifiable AI Result:', result);
    } catch (error) {
        console.error('❌ Verification failed:', error.message);
    }
}

main().catch(console.error);
