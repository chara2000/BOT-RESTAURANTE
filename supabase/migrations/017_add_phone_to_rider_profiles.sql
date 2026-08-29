-- Add phone column to rider_profiles
ALTER TABLE public.rider_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
