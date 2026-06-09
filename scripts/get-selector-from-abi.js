const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/AgentVault.json'), 'utf8'));
const iface = new ethers.Interface(artifact.abi);
const selector = iface.getFunction('handleAgentResponse').selector;
console.log('Function Selector: ' + selector);
