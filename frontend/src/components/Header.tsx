import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Shield, Zap } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="glass neon-border-purple mb-8 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="bg-purple-600/20 p-2 rounded-lg neon-border-purple">
          <Shield className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-black neon-text-purple m-0">SOMNIA <span className="text-white">AGENTPAY</span></h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Secure DeFi Execution Layer</p>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full">
          <Zap className="w-3 h-3 text-cyan-400 animate-pulse" />
          <span className="text-[10px] text-cyan-400 font-bold uppercase">Mainnet Live</span>
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" />
      </div>
    </header>
  );
};

export default Header;
