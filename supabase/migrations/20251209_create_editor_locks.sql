-- Create editor_locks table to prevent concurrent editing
CREATE TABLE IF NOT EXISTS editor_locks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name TEXT,
  locked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(restaurant_id)  -- Only one lock per restaurant
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_editor_locks_restaurant ON editor_locks(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_editor_locks_heartbeat ON editor_locks(last_heartbeat);

-- Enable RLS
ALTER TABLE editor_locks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone authenticated can read locks (to check if locked)
CREATE POLICY "Authenticated users can read locks" ON editor_locks
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can insert their own locks
CREATE POLICY "Users can insert own locks" ON editor_locks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own locks (for heartbeat)
CREATE POLICY "Users can update own locks" ON editor_locks
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own locks
CREATE POLICY "Users can delete own locks" ON editor_locks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Function to acquire editor lock (handles stale lock cleanup)
CREATE OR REPLACE FUNCTION acquire_editor_lock(
  p_restaurant_id UUID,
  p_user_email TEXT,
  p_user_name TEXT DEFAULT NULL,
  p_lock_timeout_seconds INT DEFAULT 120  -- 2 minute timeout
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_lock editor_locks%ROWTYPE;
  v_current_user_id UUID;
  v_result JSONB;
BEGIN
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check for existing lock
  SELECT * INTO v_existing_lock
  FROM editor_locks
  WHERE restaurant_id = p_restaurant_id;

  IF FOUND THEN
    -- Check if lock is stale (no heartbeat in timeout period)
    IF v_existing_lock.last_heartbeat < NOW() - (p_lock_timeout_seconds || ' seconds')::INTERVAL THEN
      -- Delete stale lock
      DELETE FROM editor_locks WHERE id = v_existing_lock.id;
    ELSIF v_existing_lock.user_id = v_current_user_id THEN
      -- User already has the lock, update heartbeat
      UPDATE editor_locks
      SET last_heartbeat = NOW()
      WHERE id = v_existing_lock.id;
      RETURN jsonb_build_object('success', true, 'message', 'Lock renewed');
    ELSE
      -- Someone else has an active lock
      RETURN jsonb_build_object(
        'success', false,
        'locked', true,
        'locked_by_email', v_existing_lock.user_email,
        'locked_by_name', v_existing_lock.user_name,
        'locked_at', v_existing_lock.locked_at,
        'last_heartbeat', v_existing_lock.last_heartbeat
      );
    END IF;
  END IF;

  -- Try to insert the lock
  BEGIN
    INSERT INTO editor_locks (restaurant_id, user_id, user_email, user_name)
    VALUES (p_restaurant_id, v_current_user_id, p_user_email, p_user_name);
    RETURN jsonb_build_object('success', true, 'message', 'Lock acquired');
  EXCEPTION WHEN unique_violation THEN
    -- Race condition - someone else got the lock
    SELECT * INTO v_existing_lock
    FROM editor_locks
    WHERE restaurant_id = p_restaurant_id;

    RETURN jsonb_build_object(
      'success', false,
      'locked', true,
      'locked_by_email', v_existing_lock.user_email,
      'locked_by_name', v_existing_lock.user_name,
      'locked_at', v_existing_lock.locked_at,
      'last_heartbeat', v_existing_lock.last_heartbeat
    );
  END;
END;
$$;

-- Function to release editor lock
CREATE OR REPLACE FUNCTION release_editor_lock(p_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id UUID;
  v_deleted_count INT;
BEGIN
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  DELETE FROM editor_locks
  WHERE restaurant_id = p_restaurant_id
    AND user_id = v_current_user_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count > 0 THEN
    RETURN jsonb_build_object('success', true, 'message', 'Lock released');
  ELSE
    RETURN jsonb_build_object('success', true, 'message', 'No lock to release');
  END IF;
END;
$$;

-- Function to update heartbeat
CREATE OR REPLACE FUNCTION heartbeat_editor_lock(p_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id UUID;
  v_updated_count INT;
BEGIN
  v_current_user_id := auth.uid();

  IF v_current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  UPDATE editor_locks
  SET last_heartbeat = NOW()
  WHERE restaurant_id = p_restaurant_id
    AND user_id = v_current_user_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count > 0 THEN
    RETURN jsonb_build_object('success', true, 'message', 'Heartbeat updated');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Lock not found or not owned by user');
  END IF;
END;
$$;

-- Cleanup function for stale locks (can be called by cron)
CREATE OR REPLACE FUNCTION cleanup_stale_editor_locks(p_timeout_seconds INT DEFAULT 120)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INT;
BEGIN
  DELETE FROM editor_locks
  WHERE last_heartbeat < NOW() - (p_timeout_seconds || ' seconds')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;
