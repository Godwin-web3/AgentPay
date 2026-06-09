require('dotenv').config();
const { ethers } = require('ethers');

async function main() {
    console.log('🧪 Testing Somnia Verifiable LLM Inference (Corrected)...');

    const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const PLATFORM_ADDRESS = '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776';
    const AGENT_ID = '12847293847561029384'; // LLM Inference Agent

    // Updated Platform ABI based on docs
    const platformAbi = [
        "function createRequest(uint256 agentId, bytes calldata payload, uint256 subcommitteeSize, bytes4 callbackSelector) external payable returns (uint256 requestId)",
        "event RequestCreated(uint256 indexed requestId, uint256 indexed agentId, address indexed sender)",
        "event ResponseFulfilled(uint256 indexed requestId, bytes data)"
    ];

    // Updated Agent ABI based on docs: inferString(prompt, system, chainOfThought, allowedValues)
    const agentAbi = new ethers.Interface([
        "function inferString(string prompt, string system, bool chainOfThought, string[] allowedValues) external returns (string)"
    ]);

    const platform = new ethers.Contract(PLATFORM_ADDRESS, platformAbi, wallet);

    const prompt = "What is the capital of France?";
    const system = "You are a helpful assistant.";
    
    console.log(`📝 Sending Prompt: "${prompt}"`);

    // Encode the call to the agent
    const agentData = agentAbi.encodeFunctionData("inferString", [prompt, system, false, []]);

    try {
        // Subcommittee size 3, no callback (0x00000000)
        // Deposit: 0.12 STT should be enough (0.07 per validator * 3 + base)
        // Let's use 0.3 STT to be safe.
        const tx = await platform.createRequest(
            AGENT_ID, 
            agentData, 
            3, 
            "0x00000000",
            { value: ethers.parseEther("2.5") }
        );

        console.log(`⏳ Transaction sent: ${tx.hash}`);
        const receipt = await tx.wait();

        const event = receipt.logs.find(log => {
            try {
                return platform.interface.parseLog(log).name === 'RequestCreated';
            } catch (e) { return false; }
        });

        if (!event) {
            console.error('❌ RequestCreated event not found');
            return;
        }

        const requestId = platform.interface.parseLog(event).args.requestId;
        console.log(`✨ Request Created! ID: ${requestId}`);
        console.log('⏳ Waiting for decentralized consensus (ResponseFulfilled event)...');

        // Listen for the response
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                platform.removeAllListeners();
                reject(new Error('Timeout waiting for agent response'));
            }, 180000); // 3 minute timeout for consensus

            platform.on(platform.filters.ResponseFulfilled(requestId), (id, data) => {
                clearTimeout(timeout);
                console.log('✅ Response Received!');
                
                // Decode the string result
                try {
                    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], data);
                    console.log('🤖 Somnia AI Result:');
                    console.log(decoded[0]);
                } catch (e) {
                    console.log('⚠️ Failed to decode response data:', data);
                }
                
                platform.removeAllListeners();
                resolve();
            });
        });

    } catch (error) {
        console.error('❌ Error calling Somnia Agent:', error);
    }
}

main().catch(console.error);
