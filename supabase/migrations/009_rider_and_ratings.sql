-- 1. Create rider_profiles
CREATE TABLE IF NOT EXISTS public.rider_profiles (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    is_available BOOLEAN DEFAULT false NOT NULL,
    vehicle_type VARCHAR(50) DEFAULT 'motorcycle' NOT NULL,
    plate_number VARCHAR(20),
    last_latitude DECIMAL(10, 8),
    last_longitude DECIMAL(11, 8),
    rating DECIMAL(3, 2) DEFAULT 5.00 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 2. Create order_ratings
CREATE TABLE IF NOT EXISTS public.order_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE NOT NULL,
    food_rating INT CHECK (food_rating BETWEEN 1 AND 5) NOT NULL,
    delivery_rating INT CHECK (delivery_rating BETWEEN 1 AND 5) NOT NULL,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 3. Create route_logs
CREATE TABLE IF NOT EXISTS public.route_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_id UUID NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 4. Enable RLS
ALTER TABLE public.rider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_logs ENABLE ROW LEVEL SECURITY;

-- 5. Policies
DROP POLICY IF EXISTS "Allow public read of rider_profiles" ON public.rider_profiles;
CREATE POLICY "Allow public read of rider_profiles" ON public.rider_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow update of own rider_profile" ON public.rider_profiles;
CREATE POLICY "Allow update of own rider_profile" ON public.rider_profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow public insert of order_ratings" ON public.order_ratings;
CREATE POLICY "Allow public insert of order_ratings" ON public.order_ratings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read of order_ratings for authenticated users" ON public.order_ratings;
CREATE POLICY "Allow read of order_ratings for authenticated users" ON public.order_ratings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert of route_logs" ON public.route_logs;
CREATE POLICY "Allow insert of route_logs" ON public.route_logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read of route_logs" ON public.route_logs;
CREATE POLICY "Allow read of route_logs" ON public.route_logs FOR SELECT USING (true);

-- 6. Trigger for profile
CREATE OR REPLACE FUNCTION public.handle_new_rider_profile()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'delivery'::user_role THEN
        INSERT INTO public.rider_profiles (id, is_available, vehicle_type, updated_at)
        VALUES (NEW.id, false, 'motorcycle', now())
        ON CONFLICT (id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_on_profile_rider_created ON public.profiles;
CREATE TRIGGER tr_on_profile_rider_created
    AFTER INSERT OR UPDATE OF role ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_rider_profile();
