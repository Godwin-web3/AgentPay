require('dotenv').config();
const { createPublicClient, http, parseAbi, formatEther, encodeFunctionData } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

// Somnia Platform Constants (from src/somniaAi.js)
const PLATFORM_ADDRESS = '0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776';
const LLM_AGENT_ID = 12847293847561029384n;
const PER_AGENT_EXECUTION_COST = 700000000000000000n;
const SUBCOMMITTEE_SIZE = 3n;
const RPC_URL = 'https://dream-rpc.somnia.network';

const PLATFORM_ABI = parseAbi([
    'function createRequest(uint256 agentId, address callbackAddress, bytes4 callbackSelector, bytes payload) external payable returns (uint256 requestId)',
    'function getRequestDeposit() external view returns (uint256)'
]);

const AGENT_ABI = parseAbi([
    'function inferString(string prompt, string system, bool chainOfThought, string[] allowedValues) external returns (string)'
]);

async function dryRun() {
    console.log('🔍 Starting Dry-Run Check...');
    
    const publicClient = createPublicClient({ transport: http(RPC_URL) });
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("PRIVATE_KEY missing in .env");
    
    const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);
    console.log(`👛 Wallet: ${account.address}`);

    // 1. Check Balance
    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`💰 Current Balance: ${formatEther(balance)} STT`);

    // 2. Calculate Deposit
    const baseDeposit = await publicClient.readContract({
        address: PLATFORM_ADDRESS,
        abi: PLATFORM_ABI,
        functionName: 'getRequestDeposit'
    });
    const totalDeposit = baseDeposit + (PER_AGENT_EXECUTION_COST * SUBCOMMITTEE_SIZE);
    const totalDepositSTT = formatEther(totalDeposit);
    console.log(`📊 Calculated Deposit: ${totalDepositSTT} STT (${totalDeposit.toString()} wei)`);

    // 3. Balance Confirmation
    if (balance < totalDeposit) {
        console.log(`❌ INSUFFICIENT BALANCE: Need ${totalDepositSTT} STT, have ${formatEther(balance)} STT.`);
    } else {
        console.log(`✅ Balance sufficient.`);
    }

    // 4. Simulate Contract Call
    console.log('🧪 Simulating createRequest call...');
    const payload = encodeFunctionData({
        abi: AGENT_ABI,
        functionName: 'inferString',
        args: ["Dry-run test", "You are a helpful assistant.", false, []]
    });

    try {
        const { result } = await publicClient.simulateContract({
            address: PLATFORM_ADDRESS,
            abi: PLATFORM_ABI,
            functionName: 'createRequest',
            args: [LLM_AGENT_ID, '0x0000000000000000000000000000000000000000', '0x00000000', payload],
            value: totalDeposit,
            account
        });
        console.log(`✅ Simulation Successful! Predicted Request ID (if returned): ${result}`);
    } catch (error) {
        console.error(`❌ Simulation Failed: ${error.message}`);
        if (error.data) console.error(`Error Data: ${error.data}`);
    }
}

dryRun();
