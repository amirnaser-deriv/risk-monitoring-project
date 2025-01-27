-- Drop existing policies
DROP POLICY IF EXISTS "Risk managers and admins can read all positions" ON positions;
DROP POLICY IF EXISTS "Users can read their own positions" ON positions;
DROP POLICY IF EXISTS "Users can create their own positions" ON positions;
DROP POLICY IF EXISTS "Users can update their own positions" ON positions;

-- Create policies for positions table
CREATE POLICY "Risk managers and admins can read all positions"
    ON positions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'risk_manager')
        )
    );

CREATE POLICY "Users can read their own positions"
    ON positions
    FOR SELECT
    USING (
        auth.uid() = user_id
        AND NOT EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'risk_manager')
        )
    );

CREATE POLICY "Users can create their own positions"
    ON positions
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'client'
        )
    );

CREATE POLICY "Users can update their own positions"
    ON positions
    FOR UPDATE
    USING (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'client'
        )
    )
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'client'
        )
    );

-- Enable RLS on positions table if not already enabled
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- Ensure public role has access to profiles table for role checks
GRANT SELECT ON profiles TO authenticated;

-- Add index on profiles.role for better performance on role checks
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
