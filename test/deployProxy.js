const { ethers } = require('hardhat');

async function deployProxied(name, args) {
  const Factory = await ethers.getContractFactory(name);
  const implementation = await Factory.deploy();
  await implementation.waitForDeployment();
  const data = implementation.interface.encodeFunctionData('initialize', args);
  const Proxy = await ethers.getContractFactory('ERC1967Proxy');
  const proxy = await Proxy.deploy(await implementation.getAddress(), data);
  await proxy.waitForDeployment();
  const contract = Factory.attach(await proxy.getAddress());
  contract.implementation = implementation;
  return contract;
}

module.exports = { deployProxied };
