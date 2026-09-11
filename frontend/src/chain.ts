export type ChainConfig = {
  key: string
  name: string
  chainId: number
  chainIdHex: string
  rpc: string
  explorer: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  usdc: string
  usdcDecimals: number
}

const ARC: ChainConfig = {
  key: 'arc',
  name: 'Arc Testnet',
  chainId: 5042002,
  chainIdHex: '0x4CEF52',
  rpc: 'https://rpc.testnet.arc.network',
  explorer: 'https://testnet.arcscan.app',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  usdc: '0x3600000000000000000000000000000000000000',
  usdcDecimals: 6,
}

const BASE_SEPOLIA: ChainConfig = {
  key: 'base-sepolia',
  name: 'Base Sepolia',
  chainId: 84532,
  chainIdHex: '0x14A34',
  rpc: 'https://sepolia.base.org',
  explorer: 'https://sepolia.basescan.org',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  usdcDecimals: 6,
}

const CHAINS: Record<string, ChainConfig> = {
  arc: ARC,
  'base-sepolia': BASE_SEPOLIA,
}

export function getFrontendChain(): ChainConfig {
  const key = (import.meta.env.VITE_CHAIN as string) || 'arc'
  const chain = CHAINS[key] || ARC
  return {
    ...chain,
    rpc: (import.meta.env.VITE_RPC_URL as string) || chain.rpc,
    usdc: (import.meta.env.VITE_USDC as string) || chain.usdc,
    usdcDecimals: Number(import.meta.env.VITE_USDC_DECIMALS) || chain.usdcDecimals,
  }
}

export function formatToken(raw: bigint | string | number, decimals: number, digits = 4): string {
  const value = typeof raw === 'bigint' ? raw : BigInt(raw || 0)
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const frac = (value % base).toString().padStart(decimals, '0').slice(0, digits)
  return whole.toString() + '.' + frac
}
