import React from 'react';
import { HistoryLog } from '../services/api';
import { Terminal, ExternalLink } from 'lucide-react';

interface ActivityTableProps {
  logs?: HistoryLog[];
}

const ActivityTable: React.FC<ActivityTableProps> = ({ logs }) => {
  return (
    <div className="glass p-6">
      <div className="flex items-center gap-2 mb-6">
        <Terminal className="w-5 h-5 text-cyan-400" />
        <h2 className="text-lg font-bold uppercase">Transaction Matrix</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase font-bold border-b border-white/5">
              <th className="pb-4 px-2">Timestamp</th>
              <th className="pb-4 px-2">Agent</th>
              <th className="pb-4 px-2">Recipient</th>
              <th className="pb-4 px-2">Amount</th>
              <th className="pb-4 px-2">Status</th>
              <th className="pb-4 px-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-[12px]">
            {logs?.map((log) => (
              <tr key={log.requestId} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="py-4 px-2 text-slate-400">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </td>
                <td className="py-4 px-2 font-mono text-purple-400">
                  {log.agentId.split('_').pop()}
                </td>
                <td className="py-4 px-2 font-mono opacity-60">
                  {log.to.slice(0, 6)}...{log.to.slice(-4)}
                </td>
                <td className="py-4 px-2 font-bold">
                  {log.amount} STT
                </td>
                <td className="py-4 px-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    log.status === 'executed' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {log.status}
                  </span>
                </td>
                <td className="py-4 px-2 text-right">
                  {log.txHash ? (
                    <a 
                      href={`https://explorer.somnia.network/tx/${log.txHash}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                    >
                      Explorer <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="opacity-20">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!logs?.length && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500 italic uppercase tracking-widest opacity-20">
                  No transaction data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ActivityTable;
