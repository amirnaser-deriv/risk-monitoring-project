-- Drop the user_roles table if it exists
DROP TABLE IF EXISTS user_roles;

-- Drop existing policies
DROP POLICY IF EXISTS "Risk managers and admins can read all positions" ON positions;

-- Update positions policies to use profiles table directly
CREATE POLICY "Risk managers and admins can read all positions"
    ON positions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'risk_manager')
        )
        OR auth.uid() = user_id  -- Always allow users to read their own positions
    );
