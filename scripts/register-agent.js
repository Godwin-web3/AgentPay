require('dotenv').config();
const { SomniaAgentKit, SOMNIA_NETWORKS } = require('somnia-agent-kit');
const { ethers } = require('ethers');

async function main() {
    console.log('🚀 Starting Somnia Agent Registration...');

    // 1. Setup Provider and Wallet
    const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const ownerAddress = await wallet.getAddress();

    console.log(`👛 Owner Address: ${ownerAddress}`);

    // 2. Initialize SomniaAgentKit
    // These addresses are typically standard on Testnet, but we use env if available
    const kit = new SomniaAgentKit({
        network: SOMNIA_NETWORKS.testnet,
        privateKey: process.env.PRIVATE_KEY,
        contracts: {
            agentRegistry: process.env.AGENT_REGISTRY_ADDRESS || '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776', // Fallback to standard testnet
            // agentManager and agentExecutor are usually handled by the kit if registry is provided
        }
    });

    try {
        await kit.initialize();
        console.log('✅ Kit Initialized');
    } catch (error) {
        console.error('❌ Failed to initialize Kit:', error.message);
        process.exit(1);
    }

    // 3. Check for existing registration
    console.log('🔍 Checking for existing agents...');
    try {
        const existingAgents = await kit.contracts.registry.getOwnerAgents(ownerAddress);
        if (existingAgents && existingAgents.length > 0) {
            console.log(`ℹ️  Found ${existingAgents.length} existing agent(s).`);
            console.log(`🆔 First Agent ID: ${existingAgents[0]}`);
            
            // Optionally update existing agent info if needed
            // For hackathon, having one registered is usually enough
            return;
        }
    } catch (error) {
        console.warn('⚠️  Could not fetch existing agents, proceeding with registration.');
    }

    // 4. Register New Agent
    const agentName = process.env.AGENT_NAME || 'AgentPay';
    const description = 'Policy-enforced autonomous payment agent for Somnia';
    const metadataUrl = 'ipfs://agentpay-v1'; // Placeholder or actual metadata
    const tags = ['payments', 'defi', 'policy-engine', 'autonomous'];

    console.log(`📝 Registering Agent: "${agentName}"...`);

    try {
        const tx = await kit.contracts.registry.registerAgent(
            agentName,
            description,
            metadataUrl,
            tags
        );

        console.log(`⏳ Waiting for transaction: ${tx.hash}`);
        const receipt = await tx.wait();

        // Parse AgentRegistered event
        const event = receipt.logs.find(
            (log) => log.topics[0] === kit.contracts.registry.interface.getEvent('AgentRegistered').topicHash
        );

        if (event) {
            const parsed = kit.contracts.registry.interface.parseLog(event);
            const agentId = parsed.args.agentId;
            console.log(`✨ Agent Registered Successfully!`);
            console.log(`🆔 Agent ID: ${agentId}`);
            console.log(`👤 Owner: ${parsed.args.owner}`);
        } else {
            console.log('✅ Transaction confirmed, but AgentRegistered event not found in logs.');
        }

    } catch (error) {
        console.error('❌ Registration failed:', error);
        if (error.reason) console.error(`Reason: ${error.reason}`);
    }
}

main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});
