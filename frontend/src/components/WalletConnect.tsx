import { useState, useEffect } from "react"
import { createPortal } from "react-dom"

const VAULT_ADDRESS = '0x4471917E96271F688282ae283d62De0B5Be8084C'
const SOMNIA_CHAIN_ID = '0xc488' // 50312 in hex

interface EIP6963ProviderDetail {
  info: {
    uuid: string
    name: string
    icon: string
    rdns: string
  }
  provider: any
}

export default function WalletConnect({ onAddressChange, onProviderChange, onBalanceChange }: { onAddressChange: (addr: string) => void, onProviderChange?: (provider: any) => void, onBalanceChange?: (vault: string, wallet: string) => void }) {
  const [address, setAddress] = useState('')
  const [balance, setBalance] = useState('0')
  const [showModal, setShowModal] = useState(false)
  const [showWalletList, setShowWalletList] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [loading, setLoading] = useState(false)
  
  const [providers, setProviders] = useState<EIP6963ProviderDetail[]>([])
  const [activeProvider, setActiveProvider] = useState<any>(null)

  useEffect(() => {
    const onAnnouncement = (event: any) => {
      setProviders(prev => {
        if (prev.find(p => p.info.uuid === event.detail.info.uuid)) return prev
        return [...prev, event.detail]
      })
    }
    window.addEventListener('eip6963:announceProvider', onAnnouncement)
    window.dispatchEvent(new Event('eip6963:requestProvider'))

    if (window.ethereum && providers.length === 0) {
      const fallback: EIP6963ProviderDetail = {
        info: { uuid: 'default', name: 'Browser Wallet', icon: '', rdns: 'default' },
        provider: window.ethereum
      }
      setProviders([fallback])
    }

    return () => window.removeEventListener('eip6963:announceProvider', onAnnouncement)
  }, [])

  async function connect(providerDetail: EIP6963ProviderDetail) {
    const provider = providerDetail.provider
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      const addr = accounts[0]
      setAddress(addr)
      setActiveProvider(provider)
      if (onProviderChange) onProviderChange(provider)
      onAddressChange(addr)
      setShowWalletList(false)

      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: SOMNIA_CHAIN_ID }],
        })
      } catch (err: any) {
        if (err.code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: SOMNIA_CHAIN_ID,
              chainName: 'Somnia Shannon Testnet',
              nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
              rpcUrls: ['https://dream-rpc.somnia.network'],
              blockExplorerUrls: ['https://shannon-explorer.somnia.network']
            }]
          })
        }
      }
      provider.on('accountsChanged', (accounts: string[]) => {
        const nextAddr = accounts[0] || ''
        setAddress(nextAddr)
        onAddressChange(nextAddr)
        if (nextAddr) fetchOnChainData(nextAddr, provider)
      })
      fetchOnChainData(addr, provider)

    } catch (err) {
      console.error('Connection failed', err)
    }
  }

  async function fetchOnChainData(userAddr: string, provider: any) {
    if (!provider) return
    try {
      const data = '0xf8b2cb4f' + userAddr.replace('0x', '').toLowerCase().padStart(64, '0') + '0000000000000000000000000000000000000000000000000000000000000000'
      const res = await provider.request({
        method: 'eth_call',
        params: [{ to: VAULT_ADDRESS, data }, 'latest']
      })
      const wei = BigInt(res === '0x' ? '0' : res)
      const vaultBal = (Number(wei) / 1e18).toFixed(4)
      setBalance(vaultBal)
      const walletRes = await provider.request({ method: "eth_getBalance", params: [userAddr, "latest"] })
      const walletBal = (Number(BigInt(walletRes)) / 1e18).toFixed(4)
      if (onBalanceChange) onBalanceChange(vaultBal, walletBal)
    } catch (err) {
      console.error('Fetch error:', err)
    }
  }

  async function handleDeposit() {
    if (!depositAmount || isNaN(Number(depositAmount)) || !activeProvider) return
    setLoading(true)
    try {
      const value = '0x' + (BigInt(Math.floor(Number(depositAmount) * 1e18))).toString(16)
      await activeProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: VAULT_ADDRESS,
          data: '0xd0e30db0',
          value
        }]
      })
      setShowModal(false)
      setDepositAmount('')
      setTimeout(() => fetchOnChainData(address, activeProvider), 4000)
    } catch (err) {
      console.error('Deposit failed', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wallet-connect">
      {!address ? (
        <button className="send-btn" onClick={() => setShowWalletList(true)}>
          Connect
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="card" style={{ padding: '6px 12px', margin: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>Vault</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 12, fontWeight: 'bold' }}>{balance} STT</span>
          </div>
          
          <button className="send-btn" onClick={() => setShowModal(true)} style={{ background: 'var(--blue)' }}>
            Fund
          </button>
        </div>
      )}

      {showWalletList && createPortal(
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginTop: 0, fontFamily: 'var(--font-head)' }}>Select Wallet</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
              {providers.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No wallets detected</div>}
              {providers.map(p => (
                <button 
                  key={p.info.uuid}
                  className="send-btn"
                  onClick={() => connect(p)}
                  style={{ 
                    background: 'rgba(255,255,255,0.05)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 15, 
                    justifyContent: 'flex-start',
                    width: '100%'
                  }}
                >
                  {p.info.icon && <img src={p.info.icon} width={24} height={24} style={{ borderRadius: 4 }} />}
                  <span style={{ fontSize: 14 }}>{p.info.name}</span>
                </button>
              ))}
              <button 
                className="send-btn" 
                onClick={() => setShowWalletList(false)}
                style={{ background: 'transparent', border: '1px solid var(--border)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {showModal && createPortal(
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginTop: 0, color: 'var(--blue)', fontFamily: 'var(--font-head)' }}>Deposit STT</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginTop: 10 }}>
              Send funds to your personal on-chain vault.
            </p>
            
            <div style={{ position: 'relative', marginTop: 25 }}>
              <input 
                type="number" 
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                style={{ 
                  width: '100%', padding: '15px 15px', background: 'var(--bg)', border: '1px solid var(--border)', 
                  color: 'var(--text)', borderRadius: 6, fontSize: 18, fontFamily: 'var(--font-mono)', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 25 }}>
              <button className="send-btn" onClick={() => setShowModal(false)} style={{ background: 'var(--muted)', flex: 1 }}>Cancel</button>
              <button className="send-btn" onClick={handleDeposit} disabled={loading} style={{ flex: 2 }}>
                {loading ? '...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  )
}
