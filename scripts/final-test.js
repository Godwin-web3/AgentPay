require('dotenv').config();
const { ethers } = require('ethers');
const { inferOnChain, PLATFORM_ADDRESS } = require('../src/somniaAi');

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const vaultAddr = process.env.VAULT_ADDRESS;

    console.log('🏁 Starting Comprehensive Test...');
    console.log('👛 Wallet:', wallet.address);
    console.log('🏦 Vault: ', vaultAddr);

    // 1. Check Balances
    const bal = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet Balance: ${ethers.formatEther(bal)} STT`);
    
    if (bal < ethers.parseEther("0.5")) {
        console.warn('⚠️  Wallet balance is low. Inference might fail.');
    }

    // 2. Check Vault Config
    const vaultAbi = [
        "function agent() view returns (address)",
        "function somniaAgentPlatform() view returns (address)",
        "function owner() view returns (address)",
        "function registerInference(uint256,address) external"
    ];
    const vault = new ethers.Contract(vaultAddr, vaultAbi, wallet);
    
    try {
        const [vaultAgent, vaultPlatform, vaultOwner] = await Promise.all([
            vault.agent(),
            vault.somniaAgentPlatform(),
            vault.owner()
        ]);
        console.log('⚙️  Vault Config:');
        console.log('   Agent:   ', vaultAgent);
        console.log('   Platform:', vaultPlatform);
        console.log('   Owner:   ', vaultOwner);

        if (vaultAgent.toLowerCase() !== wallet.address.toLowerCase()) {
            console.error('❌ Agent mismatch! Vault expects:', vaultAgent);
        }
        if (vaultPlatform.toLowerCase() !== PLATFORM_ADDRESS.toLowerCase()) {
            console.error('❌ Platform mismatch! Vault expects:', vaultPlatform);
        }
    } catch (err) {
        console.error('❌ Failed to read vault config:', err.message);
        return;
    }

    // 3. Test Selector
    // handleAgentResponse(uint256,Response[],ResponseStatus,bytes)
    // Response = (address,bytes,uint8,uint256,uint256,uint256)
    // ResponseStatus = uint8
    const iface = new ethers.Interface([
        "function handleAgentResponse(uint256 requestId, (address validator, bytes result, uint8 status, uint256 receipt, uint256 timestamp, uint256 executionCost)[] responses, uint8 status, (uint256 id, address requester, address callbackAddress, bytes4 callbackSelector, address[] subcommittee, (address validator, bytes result, uint8 status, uint256 receipt, uint256 timestamp, uint256 executionCost)[] responses, uint256 responseCount, uint256 failureCount, uint256 threshold, uint256 createdAt, uint256 deadline, uint8 status, uint8 consensusType, uint256 remainingBudget, uint256 perAgentBudget) metadata) external"
    ]);
    const selector = iface.getFunction("handleAgentResponse").selector;
    console.log('🎯 Expected Selector:', selector);

    // 4. Run Inference
    console.log('\n🧠 Testing Verifiable Inference...');
    try {
        const result = await inferOnChain(
            "Say 'AGENTPAY_TEST_OK'", 
            "Respond only with the text requested.", 
            wallet
        );
        console.log('✅ Inference Success!');
        console.log('🤖 Result:', result.result);
        console.log('🛡️  Proof:', result.requestId);
    } catch (err) {
        console.error('❌ Inference Failed:', err.message);
    }
}

main().catch(console.error);
