import React from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import PaymentForm from './components/PaymentForm';
import ActivityTable from './components/ActivityTable';
import AgentGrid from './components/AgentGrid';
import { useAgentData } from './hooks/useAgentData';
import { AlertCircle, RefreshCcw } from 'lucide-react';

const App: React.FC = () => {
  const { policy, agents, history, isLoading, isError, refetch } = useAgentData();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCcw className="w-12 h-12 text-purple-500 animate-spin" />
          <h1 className="orbitron text-sm tracking-[0.3em] text-purple-400 animate-pulse">SYNCHRONIZING TERMINAL...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:px-8">
      <Header />

      {isError && (
        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-xs font-bold uppercase tracking-wider">Sync Error: Unable to reach AgentPay Backend Node</span>
          <button onClick={() => refetch()} className="ml-auto text-[10px] bg-red-500/20 px-3 py-1 rounded hover:bg-red-500/40 transition-all uppercase font-black">Retry Sync</button>
        </div>
      )}

      <main className="space-y-8">
        {/* Top Section: Policy Overview */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="orbitron text-xs font-bold tracking-[0.2em] text-slate-500 uppercase">System Policy Status</h2>
            <div className="text-[10px] text-slate-600 font-mono">NODE_STATUS: ONLINE</div>
          </div>
          <Dashboard policy={policy} />
        </section>

        {/* Middle Section: Actions and Agents */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h2 className="orbitron text-xs font-bold tracking-[0.2em] text-slate-500 uppercase mb-4">Secure Execution</h2>
            <PaymentForm />
          </div>
          <div>
            <h2 className="orbitron text-xs font-bold tracking-[0.2em] text-slate-500 uppercase mb-4">Authorized Agents</h2>
            <AgentGrid agents={agents} />
          </div>
        </div>

        {/* Bottom Section: History */}
        <section>
          <h2 className="orbitron text-xs font-bold tracking-[0.2em] text-slate-500 uppercase mb-4">Transaction Ledger</h2>
          <ActivityTable logs={history} />
        </section>
      </main>

      <footer className="mt-20 pb-8 text-center">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent mb-8" />
        <p className="text-[10px] text-slate-600 font-mono uppercase tracking-[0.5em]">
          &copy; 2024 Somnia Network &bull; AgentPay Protocol v2.4.0-build.882
        </p>
      </footer>
    </div>
  );
};

export default App;
