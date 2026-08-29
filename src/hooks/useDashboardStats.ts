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
      
      // Silently return null if RPC fails (e.g. empty tenant with no orders)
      if (error) {
        console.warn('[DashboardStats] RPC error (non-critical):', error.message);
        return null;
      }
      return data;
    },
    refetchInterval: 60000, // Refresh every minute
    retry: false, // Don't retry on 400 errors
  });
}
