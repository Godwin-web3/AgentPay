const fs = require('fs');
const path = require('path');
const solc = require('solc');

function readContract(name) {
  return fs.readFileSync(path.join(__dirname, '../contracts', name), 'utf8');
}

const input = {
  language: 'Solidity',
  sources: {
    'ArcPair.sol': { content: readContract('ArcPair.sol') },
    'ArcFactory.sol': { content: readContract('ArcFactory.sol') },
    'ArcRouter.sol': { content: readContract('ArcRouter.sol') },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode'] }
    }
  }
};

console.log('🔨 Compiling DEX contracts...');
const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  output.errors.forEach(err => console.error(err.formattedMessage));
  if (output.errors.some(err => err.severity === 'error')) process.exit(1);
}

const artifactDir = path.join(__dirname, '../artifacts');
if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir);

['ArcPair', 'ArcFactory', 'ArcRouter'].forEach(name => {
  const contract = output.contracts[name + '.sol'][name];
  fs.writeFileSync(
    path.join(artifactDir, name + '.json'),
    JSON.stringify({ abi: contract.abi, bytecode: contract.evm.bytecode.object }, null, 2)
  );
  console.log('✅ ' + name + ' compiled');
});
