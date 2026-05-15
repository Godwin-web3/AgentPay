require('dotenv').config();
const { ethers } = require('ethers');

const VAULT_ADDRESS = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D';
const VAULT_ABI = [
  "function getSchedules(address user) external view returns (tuple(address to, uint256 amount, uint256 interval, uint256 nextRun, bool active, string reason, uint256 minBalance)[])",
  "function executeScheduled(address user, uint256 index) external"
];

// In a real Gelato task, this would be a list of all users
const USERS_TO_MONITOR = [
  process.env.TEST_USER_ADDRESS || '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);

  console.log('🚀 Starting On-Chain Schedule Poker...');
  console.log('👛 Operator: ' + wallet.address);

  for (const user of USERS_TO_MONITOR) {
    console.log(`\n🔎 Checking user: ${user}`);
    try {
      const schedules = await vault.getSchedules(user);
      
      for (let i = 0; i < schedules.length; i++) {
        const s = schedules[i];
        if (!s.active) continue;

        const now = Math.floor(Date.now() / 1000);
        const nextRun = Number(s.nextRun);
        
        console.log(`   [Job ${i}] To: ${s.to.slice(0, 10)}... | Next: ${new Date(nextRun * 1000).toLocaleString()}`);

        if (now >= nextRun) {
          console.log(`   🔥 Schedule ${i} is DUE! Executing...`);
          try {
            const tx = await vault.executeScheduled(user, i, { gasLimit: 1000000 });
            console.log(`   ✅ Success! TX: ${tx.hash}`);
            await tx.wait();
          } catch (err) {
            console.log(`   ❌ Execution failed: ${err.message.slice(0, 100)}`);
          }
        } else {
          const waitMin = Math.ceil((nextRun - now) / 60);
          console.log(`   ⏳ Not yet due. Waiting ~${waitMin} minutes.`);
        }
      }
    } catch (err) {
      console.log(`   ⚠️ Could not fetch schedules for ${user}: ${err.message}`);
    }
  }
}

main().catch(console.error);
