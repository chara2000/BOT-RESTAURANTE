-- Migration: Add extra vehicle fields to rider_profiles
ALTER TABLE public.rider_profiles 
  ADD COLUMN IF NOT EXISTS vehicle_model VARCHAR(100),
  ADD COLUMN IF NOT EXISTS vehicle_color VARCHAR(50),
  ADD COLUMN IF NOT EXISTS vehicle_description TEXT;

-- Allow service_role (admin) to manage all rider_profiles
DROP POLICY IF EXISTS "Allow admin manage rider_profiles" ON public.rider_profiles;
CREATE POLICY "Allow admin manage rider_profiles" ON public.rider_profiles 
  FOR ALL USING (true) WITH CHECK (true);
