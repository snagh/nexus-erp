-- Create usage_logs table
CREATE TABLE IF NOT EXISTS usage_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name     text,
  nivel            text,
  setor            text,
  page             text NOT NULL,
  page_friendly    text,
  session_id       text,
  duration_seconds integer DEFAULT 0,
  logged_at        timestamptz NOT NULL DEFAULT now(),
  logged_out_at    timestamptz,
  device_type      text DEFAULT 'desktop',
  day_of_week      smallint,
  hour_of_day      smallint
);

-- Indexes for fast analytics queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id    ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_logged_at  ON usage_logs(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_setor      ON usage_logs(setor);
CREATE INDEX IF NOT EXISTS idx_usage_logs_page       ON usage_logs(page);

-- Enable RLS
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own logs
CREATE POLICY "users_own_logs_insert" ON usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own logs (for adding duration and logout time)
CREATE POLICY "users_own_logs_update" ON usage_logs
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Only DEV level users can view logs
CREATE POLICY "dev_read_all_logs" ON usage_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.nivel = 'DEV'
    )
  );
