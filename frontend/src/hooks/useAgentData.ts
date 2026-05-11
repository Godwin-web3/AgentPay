import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export const useAgentData = () => {
  const policyQuery = useQuery({
    queryKey: ['policy'],
    queryFn: api.fetchPolicy,
    refetchInterval: 10000, // Refresh every 10s
  });

  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: api.fetchAgents,
    refetchInterval: 30000,
  });

  const historyQuery = useQuery({
    queryKey: ['history'],
    queryFn: api.fetchHistory,
    refetchInterval: 5000,
  });

  return {
    policy: policyQuery.data,
    agents: agentsQuery.data,
    history: historyQuery.data,
    isLoading: policyQuery.isLoading || agentsQuery.isLoading || historyQuery.isLoading,
    isError: policyQuery.isError || agentsQuery.isError || historyQuery.isError,
    refetch: () => {
      policyQuery.refetch();
      agentsQuery.refetch();
      historyQuery.refetch();
    }
  };
};
