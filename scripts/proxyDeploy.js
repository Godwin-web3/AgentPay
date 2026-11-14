const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

function loadArtifact(name) {
  const file = path.join(__dirname, '../artifacts', name + '.json');
  if (!fs.existsSync(file)) throw new Error(name + ' artifact missing. Run node scripts/compile.js first.');
  const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (artifact.bytecode && !artifact.bytecode.startsWith('0x')) artifact.bytecode = '0x' + artifact.bytecode;
  return artifact;
}

async function deployImplementation(wallet, name) {
  const artifact = loadArtifact(name);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const implementation = await factory.deploy();
  await implementation.waitForDeployment();
  return implementation;
}

async function deployProxy(wallet, implementation, initFn, initArgs) {
  const data = implementation.interface.encodeFunctionData(initFn, initArgs);
  const artifact = loadArtifact('ERC1967Proxy');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const proxy = await factory.deploy(await implementation.getAddress(), data);
  await proxy.waitForDeployment();
  return {
    contract: implementation.attach(await proxy.getAddress()),
    address: await proxy.getAddress(),
    implementation: await implementation.getAddress(),
    txHash: proxy.deploymentTransaction().hash,
  };
}

module.exports = { loadArtifact, deployImplementation, deployProxy };
