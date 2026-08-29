const dns = require('dns');
const { Client } = require('pg');

// Override DNS lookup for the pooler hostname to force IPv4
const originalLookup = dns.lookup;
dns.lookup = function(hostname, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'object' ? options : {};
  if (hostname === 'aws-0-us-east-2.pooler.supabase.com') {
    if (opts.all) {
      return cb(null, [{ address: '13.59.95.192', family: 4 }]);
    }
    return cb(null, '13.59.95.192', 4);
  }
  return originalLookup.call(this, hostname, options, callback);
};

async function run() {
  const host = 'aws-0-us-east-2.pooler.supabase.com';

  const client = new Client({
    user: 'postgres.rvdujzqsqlcgnoxioihy',
    password: 'ChefFlow2026!',
    database: 'postgres',
    port: 6543,
    host: host,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  console.log('Connecting to Supabase PostgreSQL database...');
  await client.connect();
  console.log('Connected.');

  const sql = `
    CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_tenant_id uuid)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
        v_sales_today numeric := 0;
        v_sales_week numeric := 0;
        v_sales_month numeric := 0;
        v_active_orders int := 0;
        v_delivered_orders int := 0;
        v_new_customers int := 0;
        v_returning_customers int := 0;
        v_top_products jsonb := '[]'::jsonb;
        v_sales_by_hour jsonb := '[]'::jsonb;
        v_sales_by_day jsonb := '[]'::jsonb;
        
        v_now timestamp with time zone := now();
        v_today date := current_date;
        v_week_ago timestamp with time zone := v_now - interval '7 days';
        v_month_ago timestamp with time zone := v_now - interval '30 days';
    BEGIN
        -- Verificar permisos: el usuario debe pertenecer al tenant consultado, o ser super_admin, o ser el service_role
        IF public.auth_tenant_id() != p_tenant_id 
           AND COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), '') != 'super_admin' 
           AND auth.role() != 'service_role' THEN
            RAISE EXCEPTION 'Acceso denegado al tenant';
        END IF;

        -- 1. Métricas de Ventas y Órdenes Totales
        SELECT 
            COALESCE(SUM(total) FILTER (WHERE created_at >= date_trunc('day', v_now)), 0),
            COALESCE(SUM(total) FILTER (WHERE created_at >= v_week_ago), 0),
            COALESCE(SUM(total) FILTER (WHERE created_at >= v_month_ago), 0),
            COUNT(*) FILTER (WHERE status NOT IN ('delivered', 'cancelled')),
            COUNT(*) FILTER (WHERE status = 'delivered')
        INTO 
            v_sales_today, v_sales_week, v_sales_month, v_active_orders, v_delivered_orders
        FROM orders 
        WHERE tenant_id = p_tenant_id;

        -- 2. Métricas de Clientes (Segmentos)
        SELECT 
            COUNT(*) FILTER (WHERE segment = 'new'),
            COUNT(*) FILTER (WHERE segment IN ('frequent', 'vip'))
        INTO 
            v_new_customers, v_returning_customers
        FROM customers
        WHERE tenant_id = p_tenant_id;

        -- 3. Top Products (Últimos 30 días)
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'name', p.name,
                'sold', t.sold,
                'revenue', t.revenue
            )
        ), '[]'::jsonb)
        INTO v_top_products
        FROM (
            SELECT 
                oi.product_id,
                SUM(oi.quantity) as sold,
                SUM(oi.quantity * oi.unit_price) as revenue
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.tenant_id = p_tenant_id 
              AND o.status = 'delivered'
              AND o.created_at >= v_month_ago
            GROUP BY oi.product_id
            ORDER BY revenue DESC
            LIMIT 5
        ) t
        JOIN products p ON p.id = t.product_id;

        -- 4. Ventas por hora (Últimas 24 horas - agrupadas)
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'hour', to_char(date_trunc('hour', created_at), 'HH24') || 'h',
                'amount', total_hour
            )
        ), '[]'::jsonb)
        INTO v_sales_by_hour
        FROM (
            SELECT 
                date_trunc('hour', created_at) as created_at,
                SUM(total) as total_hour
            FROM orders
            WHERE tenant_id = p_tenant_id 
              AND status = 'delivered'
              AND created_at >= v_now - interval '24 hours'
            GROUP BY 1
            ORDER BY 1
        ) t;

        -- 5. Ventas por día (Últimos 7 días)
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'day', to_char(created_at, 'Dy'),
                'amount', total_day
            )
        ), '[]'::jsonb)
        INTO v_sales_by_day
        FROM (
            SELECT 
                date_trunc('day', created_at) as created_at,
                SUM(total) as total_day
            FROM orders
            WHERE tenant_id = p_tenant_id 
              AND status = 'delivered'
              AND created_at >= v_week_ago
            GROUP BY 1
            ORDER BY 1
        ) t;

        -- Construir y retornar objeto final JSON
        RETURN jsonb_build_object(
            'salesToday', v_sales_today,
            'salesWeek', v_sales_week,
            'salesMonth', v_sales_month,
            'activeOrders', v_active_orders,
            'deliveredOrders', v_delivered_orders,
            'avgTicket', CASE WHEN v_delivered_orders > 0 THEN v_sales_month / v_delivered_orders ELSE 0 END,
            'newCustomers', v_new_customers,
            'returningCustomers', v_returning_customers,
            'topProducts', v_top_products,
            'salesByHour', v_sales_by_hour,
            'salesByDay', v_sales_by_day
        );
    END;
    $$;
  `;

  console.log('Applying RPC fix...');
  await client.query(sql);
  console.log('RPC fix successfully applied.');
  await client.end();
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
