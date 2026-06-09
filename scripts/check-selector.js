const { ethers } = require('ethers');
const sig = 'handleAgentResponse(uint256,(address,bytes,uint8,uint256,uint256,uint256)[],uint8,(uint256,address,address,bytes4,address[],(address,bytes,uint8,uint256,uint256,uint256)[],uint256,uint256,uint256,uint256,uint256,uint8,uint8,uint256,uint256))';
const selector = ethers.id(sig).substring(0, 10);
console.log('Signature: ' + sig);
console.log('Selector: ' + selector);
