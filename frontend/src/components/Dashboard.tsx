import React from 'react';
import { Policy } from '../services/api';
import { Activity, ShieldAlert, Clock, Target } from 'lucide-react';

interface DashboardProps {
  policy?: Policy;
}

const Dashboard: React.FC<DashboardProps> = ({ policy }) => {
  if (!policy) return null;

  const spendPercent = Math.min(100, (policy.dailySpendSoFar / policy.dailyCap) * 100);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      {/* Daily Spend Gauge */}
      <div className="glass p-6 md:col-span-2 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Activity className="w-24 h-24" />
        </div>
        
        <div className="relative w-40 h-40 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
                <circle
                    cx="80" cy="80" r="70"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="8"
                    fill="transparent"
                />
                <circle
                    cx="80" cy="80" r="70"
                    stroke="var(--neon-purple)"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={440}
                    strokeDashoffset={440 - (440 * spendPercent) / 100}
                    className="transition-all duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black">{policy.dailySpendSoFar.toFixed(2)}</span>
                <span className="text-[10px] text-slate-500 uppercase font-bold">STT Spent Today</span>
            </div>
        </div>
        
        <div className="mt-6 flex gap-8 w-full justify-center">
            <div className="text-center">
                <div className="text-slate-500 text-[10px] uppercase font-bold mb-1">Daily Cap</div>
                <div className="text-lg font-bold">{policy.dailyCap} STT</div>
            </div>
            <div className="text-center">
                <div className="text-slate-500 text-[10px] uppercase font-bold mb-1">Remaining</div>
                <div className="text-lg font-bold neon-text-cyan">{policy.dailyRemaining.toFixed(2)} STT</div>
            </div>
        </div>
      </div>

      {/* Policy Stats */}
      <div className="space-y-6 md:col-span-2">
        <div className="grid grid-cols-2 gap-4">
            <div className="glass p-4 border-l-4 border-l-cyan-400">
                <Target className="w-5 h-5 text-cyan-400 mb-2" />
                <div className="text-slate-500 text-[10px] uppercase font-bold">Per-Tx Cap</div>
                <div className="text-xl font-bold">{policy.perTxCap} STT</div>
            </div>
            <div className="glass p-4 border-l-4 border-l-purple-400">
                <Clock className="w-5 h-5 text-purple-400 mb-2" />
                <div className="text-slate-500 text-[10px] uppercase font-bold">Active Window</div>
                <div className="text-xl font-bold">{policy.activeHours.start}:00 - {policy.activeHours.end}:00</div>
            </div>
        </div>

        <div className={`glass p-4 border-l-4 ${policy.circuitBreaker.active ? 'border-l-red-500' : 'border-l-green-400'}`}>
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-slate-500 text-[10px] uppercase font-bold">Circuit Breaker</div>
                    <div className={`text-xl font-bold ${policy.circuitBreaker.active ? 'text-red-500' : 'text-green-400'}`}>
                        {policy.circuitBreaker.active ? 'TRIGGERED' : 'OPERATIONAL'}
                    </div>
                </div>
                <ShieldAlert className={`w-8 h-8 ${policy.circuitBreaker.active ? 'text-red-500' : 'text-green-400 opacity-20'}`} />
            </div>
        </div>

        <div className="glass p-4">
            <div className="text-slate-500 text-[10px] uppercase font-bold mb-3">Whitelisted Targets</div>
            <div className="flex flex-wrap gap-2">
                {policy.whitelist.map((addr, idx) => (
                    <span key={idx} className="text-[10px] bg-white/5 border border-white/10 px-2 py-1 rounded font-mono truncate max-w-[120px]">
                        {addr}
                    </span>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
