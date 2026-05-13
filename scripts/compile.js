const fs = require('fs');
const path = require('path');
const solc = require('solc');

async function compile() {
  const contractPath = path.join(__dirname, '../contracts/AgentVault.sol');
  const source = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'AgentVault.sol': {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
    },
  };

  console.log('🔨 Compiling AgentVault.sol...');
  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    output.errors.forEach((err) => {
      console.error(err.formattedMessage);
    });
    if (output.errors.some(err => err.severity === 'error')) {
      process.exit(1);
    }
  }

  const contract = output.contracts['AgentVault.sol']['AgentVault'];

  const artifactDir = path.join(__dirname, '../artifacts');
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir);
  }

  fs.writeFileSync(
    path.join(artifactDir, 'AgentVault.json'),
    JSON.stringify({
      abi: contract.abi,
      bytecode: contract.evm.bytecode.object,
    }, null, 2)
  );

  console.log('✅ Compiled successfully! Artifact saved to artifacts/AgentVault.json');
}

compile().catch(console.error);
