import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getActiveTenantId } from '@/services/api';

export function useDashboardStats(tenantId?: string) {
  const activeTid = tenantId || getActiveTenantId();
  return useQuery({
    queryKey: ['dashboardStats', activeTid],
    queryFn: async () => {
      const supabase = createClient();
      if (!supabase) return null;
      
      const { data, error } = await supabase.rpc('get_dashboard_stats', {
        p_tenant_id: activeTid
      });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}
