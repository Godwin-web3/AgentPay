module.exports = {
  chainId: 5042002,
  rpc: "https://rpc.testnet.arc.network",
  ws: "wss://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
  usdc: "0x3600000000000000000000000000000000000000",
  // Arc-native USDC decimal count. Override with USDC_DECIMALS env if a
  // different token standard is in use. All JS↔contract amount conversions
  // go through utils/usdc.js so this stays the single source of truth.
  usdcDecimals: Number(process.env.USDC_DECIMALS) || 18,
  gateway: {
    wallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    minter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"
  }
};