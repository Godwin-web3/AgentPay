const fs = require('fs');
const path = require('path');
const solc = require('solc');

const contractPath = path.join(__dirname, '../contracts/AgentPayEscrow.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'AgentPayEscrow.sol': { content: source }
  },
  settings: {
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode'] }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  output.errors.forEach(e => console.error(e.formattedMessage));
}

const contract = output.contracts['AgentPayEscrow.sol']['AgentPayEscrow'];

fs.mkdirSync(path.join(__dirname, '../artifacts'), { recursive: true });
fs.writeFileSync(
  path.join(__dirname, '../artifacts/AgentPayEscrow.json'),
  JSON.stringify({ abi: contract.abi, bytecode: contract.evm.bytecode.object }, null, 2)
);

console.log('✅ Compiled. ABI + bytecode saved to artifacts/AgentPayEscrow.json');
