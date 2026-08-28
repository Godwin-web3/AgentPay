require('@nomicfoundation/hardhat-toolbox');

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'shanghai',
      viaIR: true,
    },
  },
  paths: {
    // Kept separate from ./artifacts (production output of scripts/compile.js
    // + scripts/deploy.js, which holds real Arc-testnet deployment addresses).
    // Hardhat wipes/rewrites whatever it thinks is its own output directory,
    // so it must never point at that folder.
    sources: './contracts',
    tests: './test',
    artifacts: './hardhat-artifacts',
    cache: './hardhat-cache',
  },
};
