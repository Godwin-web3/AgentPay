const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/AgentVault-deployment.json'), 'utf8'));
const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/AgentVault.json'), 'utf8'));

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
  const contract = new ethers.Contract(deployment.address, artifact.abi, provider);

  console.log('🔍 Verifying Contract at:', deployment.address);
  
  try {
    const owner = await contract.owner();
    console.log('✅ Owner:', owner);
    
    // Check if functions exist
    const schedules = await contract.getSchedules(process.env.AGENT_ADDRESS || process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY).address : ethers.ZeroAddress);
    console.log('✅ Schedules function responsive. Current count:', schedules.length);
    
    console.log('🎉 Everything is connected properly.');
  } catch (err) {
    console.error('❌ Error calling contract:', err.message);
  }
}
main();
