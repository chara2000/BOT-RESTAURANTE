-- ====================================================================
-- SUPABASE DATABASE SCHEMA - SaaS AI Restaurant & POS Platform
-- ====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Roles Enum
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'operator', 'kitchen', 'delivery');
CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'shipping', 'delivered', 'cancelled');
CREATE TYPE order_type AS ENUM ('delivery', 'pickup', 'dine_in');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'nequi', 'daviplata', 'wompi', 'transfer');
CREATE TYPE customer_segment AS ENUM ('new', 'frequent', 'vip', 'inactive');
CREATE TYPE transaction_type AS ENUM ('income', 'expense');

-- 1. Tenants (SaaS Restaurants)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    plan_type VARCHAR(50) DEFAULT 'free',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Branches
CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Profiles (Users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role user_role DEFAULT 'operator'::user_role NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Products
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    image_url TEXT,
    is_available BOOLEAN DEFAULT true,
    is_combo BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Inventory Items
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL, -- e.g., 'grams', 'units', 'ml'
    stock DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    min_stock DECIMAL(12,2) NOT NULL DEFAULT 10.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Product Ingredients Mapping
CREATE TABLE product_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
    inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE NOT NULL,
    quantity_required DECIMAL(12,2) NOT NULL DEFAULT 1.00
);

-- 8. Customers CRM
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    telegram_chat_id VARCHAR(100) UNIQUE,
    segment customer_segment DEFAULT 'new'::customer_segment NOT NULL,
    total_spent DECIMAL(12,2) DEFAULT 0.00 NOT NULL,
    order_count INT DEFAULT 0 NOT NULL,
    address_default TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Cash POS Sessions
CREATE TABLE cash_registers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    opened_by UUID REFERENCES profiles(id) NOT NULL,
    closed_by UUID REFERENCES profiles(id),
    opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    closing_balance DECIMAL(12,2),
    actual_cash DECIMAL(12,2),
    difference DECIMAL(12,2),
    status VARCHAR(20) DEFAULT 'open' NOT NULL, -- 'open', 'closed'
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    closed_at TIMESTAMP WITH TIME ZONE
);

-- 10. Cash Transactions (Inflow/Outflow)
CREATE TABLE cash_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    register_id UUID REFERENCES cash_registers(id) ON DELETE CASCADE NOT NULL,
    type transaction_type NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. Orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    register_id UUID REFERENCES cash_registers(id) ON DELETE SET NULL,
    type order_type NOT NULL DEFAULT 'dine_in'::order_type,
    status order_status NOT NULL DEFAULT 'pending'::order_status,
    payment_method payment_method NOT NULL DEFAULT 'cash'::payment_method,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    tips DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    delivery_address TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. Order Items
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    notes TEXT
);

-- 13. Delivery Dispatch & Realtime GPS tracking
CREATE TABLE delivery_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE UNIQUE NOT NULL,
    rider_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'searching' NOT NULL, -- 'searching', 'assigned', 'picked_up', 'delivered', 'failed'
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    estimated_arrival TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 14. Stock Movements Log
CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id UUID REFERENCES inventory(id) ON DELETE CASCADE NOT NULL,
    quantity DECIMAL(12,2) NOT NULL, -- positive for load, negative for sales/waste
    reason VARCHAR(100) NOT NULL, -- e.g., 'sale', 'purchase', 'waste', 'correction'
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ====================================================================
-- TRIGGERS & FUNCTIONS
-- ====================================================================

-- Trigger to discount stock automatically on sale confirmation
CREATE OR REPLACE FUNCTION process_order_stock_discount()
RETURNS TRIGGER AS $$
DECLARE
    item RECORD;
    ingredient RECORD;
BEGIN
    -- Only discount when order is moved to 'confirmed' or 'preparing'
    IF (NEW.status = 'confirmed' OR NEW.status = 'preparing') AND (OLD.status = 'pending') THEN
        -- Loop through order items
        FOR item IN SELECT * FROM order_items WHERE order_id = NEW.id LOOP
            -- Loop through ingredients of the product
            FOR ingredient IN SELECT * FROM product_ingredients WHERE product_id = item.product_id LOOP
                -- Update stock
                UPDATE inventory 
                SET stock = stock - (ingredient.quantity_required * item.quantity),
                    updated_at = now()
                WHERE id = ingredient.inventory_id;
                
                -- Log stock movement
                INSERT INTO stock_movements (inventory_id, quantity, reason, created_at)
                VALUES (ingredient.inventory_id, -(ingredient.quantity_required * item.quantity), 'sale', now());
            END LOOP;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_order_stock_discount
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION process_order_stock_discount();

-- Trigger to recalculate customer CRM stats (total spent & count) when order is delivered
CREATE OR REPLACE FUNCTION update_customer_metrics()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'delivered' AND OLD.status != 'delivered' AND NEW.customer_id IS NOT NULL THEN
        UPDATE customers
        SET total_spent = total_spent + NEW.total,
            order_count = order_count + 1,
            updated_at = now()
        WHERE id = NEW.customer_id;
        
        -- Segment updates
        UPDATE customers
        SET segment = 
            CASE 
                WHEN order_count >= 10 AND total_spent >= 250000 THEN 'vip'::customer_segment
                WHEN order_count >= 3 THEN 'frequent'::customer_segment
                ELSE 'new'::customer_segment
            END
        WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_customer_metrics
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_metrics();


-- ====================================================================
-- INDEXES FOR PERFORMANCE
-- ====================================================================
CREATE INDEX idx_orders_tenant_branch ON orders(tenant_id, branch_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_inventory_tenant_branch ON inventory(tenant_id, branch_id);
CREATE INDEX idx_customers_telegram ON customers(telegram_chat_id);
CREATE INDEX idx_delivery_order ON delivery_details(order_id);
CREATE INDEX idx_cash_registers_active ON cash_registers(tenant_id, branch_id) WHERE status = 'open';

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- Dynamic tenant-based policies (simplified for SaaS implementation)
CREATE POLICY tenant_isolation_tenants ON tenants
    USING (id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY tenant_isolation_branches ON branches
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY tenant_isolation_profiles ON profiles
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY tenant_isolation_categories ON categories
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY tenant_isolation_products ON products
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY tenant_isolation_inventory ON inventory
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY tenant_isolation_orders ON orders
    USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
