import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function TopBar() {
  return (
    <div className="topbar">
      <div style={{ flex: 1 }} />
      <ConnectButton 
        accountStatus="address"
        chainStatus="name"
        showBalance={true}
      />
    </div>
  )
}
