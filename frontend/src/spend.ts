import { ethers } from 'ethers'
import type { ConnectedWallet } from '@privy-io/react-auth'

const HOOD = 46630
const BASE = 84532
const ARC = 5042002

const BASE_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const EXPLORER: Record<number, string> = {
  [HOOD]: 'https://explorer.testnet.chain.robinhood.com/tx/',
  [BASE]: 'https://sepolia.basescan.org/tx/',
  [ARC]: 'https://testnet.arcscan.app/tx/',
}

export async function signerFor(wallets: ConnectedWallet[], chainId: number) {
  const wallet = wallets.find((item) => item.walletClientType === 'privy') || wallets[0]
  if (!wallet) throw new Error('Sign in again. Your wallet is not ready.')
  await wallet.switchChain(chainId)
  const provider = new ethers.BrowserProvider(await wallet.getEthereumProvider())
  return provider.getSigner()
}

export async function sendContractCall(
  wallets: ConnectedWallet[],
  tx: { chainId: number; to: string; data: string; value?: string },
) {
  const signer = await signerFor(wallets, Number(tx.chainId))
  const sent = await signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n })
  const receipt = await sent.wait()
  if (!receipt || receipt.status === 0) throw new Error('The transaction failed. Nothing else was moved.')
  return { txHash: receipt.hash, explorer: explorer(Number(tx.chainId), receipt.hash || '') }
}

function explorer(chainId: number, hash: string) {
  return (EXPLORER[chainId] || '') + hash
}

export async function sendFromWallet(
  wallets: ConnectedWallet[],
  spec: { chainId: number; symbol: string; kind: 'native' | 'erc20'; address?: string; decimals: number },
  amount: number,
  to: string,
) {
  if (!ethers.isAddress(to)) throw new Error('That recipient is not an address.')
  const signer = await signerFor(wallets, spec.chainId)
  if (spec.kind === 'native') {
    const sent = await signer.sendTransaction({ to, value: ethers.parseUnits(String(amount), spec.decimals) })
    const receipt = await sent.wait()
    return { txHash: receipt?.hash, explorer: explorer(spec.chainId, receipt?.hash || '') }
  }
  if (!spec.address) throw new Error(spec.symbol + ' is not on this chain.')
  const erc20 = new ethers.Contract(spec.address, ['function transfer(address,uint256) returns (bool)'], signer)
  const sent = await erc20.transfer(to, ethers.parseUnits(String(amount), spec.decimals))
  const receipt = await sent.wait()
  return { txHash: receipt?.hash, explorer: explorer(spec.chainId, receipt?.hash || '') }
}

export async function sendUsdc(wallets: ConnectedWallet[], chain: 'base' | 'arc', amount: number, to: string) {
  if (!ethers.isAddress(to)) throw new Error('That recipient is not an address.')
  if (chain === 'arc') {
    const signer = await signerFor(wallets, ARC)
    const sent = await signer.sendTransaction({ to, value: ethers.parseEther(String(amount)) })
    const receipt = await sent.wait()
    return { txHash: receipt?.hash, explorer: explorer(ARC, receipt?.hash || '') }
  }
  const signer = await signerFor(wallets, BASE)
  const erc20 = new ethers.Contract(BASE_USDC, ['function transfer(address,uint256) returns (bool)'], signer)
  const sent = await erc20.transfer(to, ethers.parseUnits(String(amount), 6))
  const receipt = await sent.wait()
  return { txHash: receipt?.hash, explorer: explorer(BASE, receipt?.hash || '') }
}

export async function depositFromWallet(wallets: ConnectedWallet[], chainId: number, tokenAddress: string, decimals: number, vault: string, amount: number) {
  if (!ethers.isAddress(vault)) throw new Error('No vault on this chain yet.')
  const signer = await signerFor(wallets, chainId)
  const raw = ethers.parseUnits(String(amount), decimals)
  const token = new ethers.Contract(tokenAddress, ['function approve(address,uint256) returns (bool)'], signer)
  const approved = await token.approve(vault, raw)
  await approved.wait()
  const pool = new ethers.Contract(vault, ['function deposit(uint256)'], signer)
  const sent = await pool.deposit(raw)
  const receipt = await sent.wait()
  return { txHash: receipt?.hash, explorer: explorer(chainId, receipt?.hash || '') }
}

export async function swapFromWallet(wallets: ConnectedWallet[], quote: {
  tokenIn: string
  tokenOut: string
  fee: number
  amountIn: number | string
  amountOutMinRaw: string
  router: string
  decimals?: number
}) {
  const signer = await signerFor(wallets, BASE)
  const amountIn = ethers.parseUnits(String(quote.amountIn), quote.decimals || 6)
  const token = new ethers.Contract(quote.tokenIn, ['function approve(address,uint256) returns (bool)'], signer)
  const approved = await token.approve(quote.router, amountIn)
  await approved.wait()
  const router = new ethers.Contract(quote.router, [
    'function exactInputSingle((address,address,uint24,address,uint256,uint256,uint160)) payable returns (uint256)',
  ], signer)
  const me = await signer.getAddress()
  const sent = await router.exactInputSingle([
    quote.tokenIn,
    quote.tokenOut,
    quote.fee,
    me,
    amountIn,
    BigInt(quote.amountOutMinRaw),
    0,
  ])
  const receipt = await sent.wait()
  return { txHash: receipt?.hash, explorer: explorer(BASE, receipt?.hash || '') }
}

export async function bridgeFromWallet(wallets: ConnectedWallet[], quote: {
  amount: string
  tokenDecimals: number
  token: string
  messenger: string
  transmitter: string
  toDomain: number
  fromDomain: number
  maxFee: string
  fromChainId: number
  toChainId: number
}) {
  const signer = await signerFor(wallets, quote.fromChainId)
  const me = await signer.getAddress()
  const raw = ethers.parseUnits(quote.amount, quote.tokenDecimals)
  const token = new ethers.Contract(quote.token, ['function approve(address,uint256) returns (bool)'], signer)
  const approved = await token.approve(quote.messenger, raw)
  await approved.wait()
  const burner = new ethers.Contract(quote.messenger, [
    'function depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)',
  ], signer)
  const burned = await burner.depositForBurn(
    raw,
    quote.toDomain,
    ethers.zeroPadValue(me, 32),
    quote.token,
    ethers.ZeroHash,
    BigInt(quote.maxFee),
    1000,
  )
  const burnReceipt = await burned.wait()
  const burnTx = burnReceipt?.hash || ''
  const attested = await waitForAttestation(quote.fromDomain, burnTx)
  if (!attested) {
    return { status: 'burned' as const, txHash: burnTx, explorer: explorer(quote.fromChainId, burnTx) }
  }
  const dest = await signerFor(wallets, quote.toChainId)
  const receiver = new ethers.Contract(quote.transmitter, ['function receiveMessage(bytes,bytes)'], dest)
  const minted = await receiver.receiveMessage(attested.message, attested.attestation)
  const mintReceipt = await minted.wait()
  return { status: 'executed' as const, txHash: mintReceipt?.hash || burnTx, explorer: explorer(quote.toChainId, mintReceipt?.hash || burnTx) }
}

async function waitForAttestation(domain: number, txHash: string) {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`https://iris-api-sandbox.circle.com/v2/messages/${domain}?transactionHash=${txHash}`)
    if (res.ok) {
      const body = await res.json()
      const msg = body.messages && body.messages[0]
      if (msg && msg.status === 'complete' && msg.message && msg.attestation && msg.attestation !== 'PENDING') return msg
    }
    await new Promise((r) => setTimeout(r, 4000))
  }
  return null
}
