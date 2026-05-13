import { useState, useEffect } from 'react'

const VAULT_ADDRESS = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D'
const SOMNIA_CHAIN_ID = '0xc488' // 50312 in hex

export default function WalletConnect({ onAddressChange }: { onAddressChange: (addr: string) => void }) {
  const [address, setAddress] = useState('')
  const [balance, setBalance] = useState('0')
  const [showModal, setShowModal] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [loading, setLoading] = useState(false)

  // Function selectors (First 4 bytes of keccak256 hash)
  const SIG_DEPOSIT = '0xd0e30db0' // deposit()
  const SIG_GET_BALANCE = '0x5ff0135c' // getBalance(address)

  useEffect(() => {
    if (window.ethereum) {
      // Handle account changes
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        const addr = accounts[0] || ''
        setAddress(addr)
        onAddressChange(addr)
        if (addr) fetchOnChainData(addr)
      })

      // Check if already connected
      window.ethereum.request({ method: 'eth_accounts' }).then((accounts: string[]) => {
        if (accounts.length > 0) {
          setAddress(accounts[0])
          onAddressChange(accounts[0])
          fetchOnChainData(accounts[0])
        }
      })
    }
  }, [])

  async function connect() {
    if (!window.ethereum) return alert('Please install MetaMask')
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const addr = accounts[0]
      setAddress(addr)
      onAddressChange(addr)

      // Network check/switch
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: SOMNIA_CHAIN_ID }],
        })
      } catch (err: any) {
        if (err.code === 4902) {
          await window.ethereum.request({
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
      fetchOnChainData(addr)
    } catch (err) {
      console.error('Connection failed', err)
    }
  }

  async function fetchOnChainData(userAddr: string) {
    try {
      // Call getBalance(userAddr)
      const data = SIG_GET_BALANCE + userAddr.replace('0x', '').padStart(64, '0')
      const res = await window.ethereum.request({
        method: 'eth_call',
        params: [{ to: VAULT_ADDRESS, data }, 'latest']
      })
      const wei = BigInt(res === '0x' ? '0' : res)
      setBalance((Number(wei) / 1e18).toFixed(4))
    } catch (err) {
      console.error('Fetch error:', err)
    }
  }

  async function handleDeposit() {
    if (!depositAmount || isNaN(Number(depositAmount))) return
    setLoading(true)
    try {
      const value = '0x' + (BigInt(Math.floor(Number(depositAmount) * 1e18))).toString(16)
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: VAULT_ADDRESS,
          data: SIG_DEPOSIT,
          value
        }]
      })
      console.log('Deposit TX:', txHash)
      setShowModal(false)
      setDepositAmount('')
      // Update balance after a short delay
      setTimeout(() => fetchOnChainData(address), 4000)
    } catch (err) {
      console.error('Deposit failed', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wallet-connect">
      {!address ? (
        <button className="send-btn" onClick={connect} style={{ width: 'auto', padding: '0 20px', fontSize: 13 }}>
          Connect Wallet
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="card" style={{ padding: '6px 12px', margin: 0, border: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Vault</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 13, fontWeight: 'bold' }}>{balance} STT</span>
          </div>
          
          <button className="send-btn" onClick={() => setShowModal(true)} style={{ width: 'auto', padding: '0 15px', background: 'var(--blue)', fontSize: 13 }}>
            Deposit
          </button>

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', background: 'var(--border)', padding: '8px 12px', borderRadius: 4, opacity: 0.8 }}>
            {address.slice(0, 6)}...{address.slice(-4)}
          </div>
        </div>
      )}

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="card" style={{ width: 340, padding: 30, border: '1px solid var(--blue)', boxShadow: '0 0 30px rgba(0, 243, 255, 0.1)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--blue)' }}>Fund Agent Vault</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              Your funds stay in your vault. The agent can only execute payments that pass your on-chain rules.
            </p>
            
            <div style={{ position: 'relative', marginTop: 25 }}>
              <input 
                type="number" 
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                style={{ 
                  width: '100%', padding: '15px 45px 15px 15px', background: 'var(--bg)', border: '1px solid var(--border)', 
                  color: 'var(--text)', borderRadius: 6, fontSize: 18, fontFamily: 'var(--font-mono)', boxSizing: 'border-box'
                }}
              />
              <span style={{ position: 'absolute', right: 15, top: 15, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>STT</span>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 25 }}>
              <button className="send-btn" onClick={() => setShowModal(false)} style={{ background: 'var(--muted)', flex: 1 }}>Cancel</button>
              <button className="send-btn" onClick={handleDeposit} disabled={loading} style={{ flex: 2 }}>
                {loading ? 'Confirming...' : 'Deposit STT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
