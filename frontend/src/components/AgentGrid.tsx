import React from 'react';
import { Agent } from '../services/api';
import { Users, Star } from 'lucide-react';

interface AgentGridProps {
  agents?: Agent[];
}

const AgentGrid: React.FC<AgentGridProps> = ({ agents }) => {
  return (
    <div className="glass p-6 h-full">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-pink-400" />
        <h2 className="text-lg font-bold uppercase">Agent Directory</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 overflow-y-auto max-h-[600px] pr-2">
        {agents?.map((agent) => (
          <div key={agent.agentId} className="p-4 bg-white/5 border border-white/10 rounded-lg hover:border-pink-500/30 transition-all">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="text-sm font-bold text-pink-400">{agent.name}</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">{agent.description || 'No description provided'}</p>
              </div>
              <div className="bg-white/10 px-2 py-1 rounded text-[10px] font-mono">
                {agent.agentId.slice(0, 10)}...
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-[10px] uppercase font-bold mb-1.5">
                <span className="text-slate-500 flex items-center gap-1">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                  Reputation Score
                </span>
                <span className={agent.reputation.score > 80 ? 'text-green-400' : 'text-yellow-400'}>
                  {agent.reputation.score}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${agent.reputation.score > 80 ? 'bg-green-400' : 'bg-yellow-400'}`}
                  style={{ width: `${agent.reputation.score}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div>
                    <div className="text-[8px] text-slate-500 uppercase font-black">Total</div>
                    <div className="text-xs font-bold">{agent.reputation.total}</div>
                </div>
                <div>
                    <div className="text-[8px] text-green-500 uppercase font-black">Approved</div>
                    <div className="text-xs font-bold text-green-500/80">{agent.reputation.approved}</div>
                </div>
                <div>
                    <div className="text-[8px] text-red-500 uppercase font-black">Rejected</div>
                    <div className="text-xs font-bold text-red-500/80">{agent.reputation.rejected}</div>
                </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentGrid;
