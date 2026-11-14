const chains = [
  {
    index: '01',
    name: 'Robinhood',
    id: '46630',
    lines: ['ETH', 'USDG', 'TSLA', 'AMD', 'AMZN', 'NFLX', 'PLTR'],
  },
  {
    index: '02',
    name: 'Base',
    id: '84532',
    lines: ['ETH', 'USDC', 'Swap to ETH'],
  },
  {
    index: '03',
    name: 'Arc',
    id: '5042002',
    lines: ['USDC', 'Bridge with Base'],
  },
]

export default function Landing({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div className="sheet">
      <header className="sheet-bar">
        <span className="mark">AgentPay</span>
        <button type="button" onClick={onLaunch} className="text-link">Enter</button>
      </header>

      <main className="sheet-main">
        <p className="kicker">Testnet wallet</p>
        <h1 className="display">
          One address.
          <span className="display-em">Three chains.</span>
        </h1>
        <p className="lede">
          Sign in with Google. The same address holds Robinhood, Base, and Arc. Nothing moves until you confirm.
        </p>

        <div className="chain-book" role="list">
          {chains.map((chain) => (
            <div key={chain.name} className="chain-row" role="listitem">
              <span className="chain-index">{chain.index}</span>
              <div>
                <div className="chain-name">{chain.name}</div>
                <div className="chain-id">Chain {chain.id}</div>
              </div>
              <div className="chain-lines">
                {chain.lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={onLaunch} className="ink-btn">Open the wallet</button>
        <p className="fine">The key stays in your session. AgentPay does not hold it.</p>
      </main>
    </div>
  )
}
