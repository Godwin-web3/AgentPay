import { Wordmark } from '../components/Mark'

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
    <div className="sheet sheet-home">
      <header className="sheet-bar">
        <Wordmark />
        <button type="button" onClick={onLaunch} className="text-link">Sign in</button>
      </header>

      <main className="home">
        <section className="home-copy">
          <p className="kicker">Testnet wallet</p>
          <h1 className="display">
            Nothing moves
            <span className="display-em">until you confirm.</span>
          </h1>
          <p className="lede">
            Sign in with Google. One non-custodial address on Robinhood, Base Sepolia, and Arc. Say what to send. You approve it in this session.
          </p>
          <button type="button" onClick={onLaunch} className="ink-btn">Continue with Google</button>
          <p className="fine">No seed phrase. AgentPay does not hold the key.</p>
        </section>

        <aside className="home-side" aria-label="Networks">
          <p className="kicker">Where it settles</p>
          <div className="chain-book" role="list">
            {chains.map((chain) => (
              <div key={chain.name} className="chain-row" role="listitem">
                <span className="chain-index">{chain.index}</span>
                <div>
                  <div className="chain-name">{chain.name}</div>
                  <div className="chain-id">Chain {chain.id}</div>
                </div>
                <div className="chain-lines">{chain.lines.join(' · ')}</div>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  )
}
