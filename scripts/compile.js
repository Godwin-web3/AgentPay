const fs = require('fs');
const path = require('path');
const solc = require('solc');

async function compile() {
  const contractsDir = path.join(__dirname, '../contracts');
  const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.sol'));
  
  const sources = {};
  for (const file of files) {
    sources[file] = {
      content: fs.readFileSync(path.join(contractsDir, file), 'utf8'),
    };
  }

  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: 'shanghai',
      viaIR: true,
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode'],
        },
      },
    },
  };

  console.log(`🔨 Compiling ${files.length} contracts...`);
  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    let hasError = false;
    output.errors.forEach((err) => {
      if (err.severity === 'error') hasError = true;
      console.error(err.formattedMessage);
    });
    if (hasError) process.exit(1);
  }

  const artifactDir = path.join(__dirname, '../artifacts');
  if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir);

  for (const fileName in output.contracts) {
    for (const contractName in output.contracts[fileName]) {
      const contract = output.contracts[fileName][contractName];
      fs.writeFileSync(
        path.join(artifactDir, `${contractName}.json`),
        JSON.stringify({
          abi: contract.abi,
          bytecode: contract.evm.bytecode.object,
        }, null, 2)
      );
      console.log(`✅ ${contractName} compiled.`);
    }
  }
}

compile().catch(console.error);
