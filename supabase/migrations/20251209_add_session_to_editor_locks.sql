-- Add session_id to editor_locks to prevent same user from editing in multiple tabs/devices
ALTER TABLE editor_locks ADD COLUMN IF NOT EXISTS session_id TEXT;

-- Update acquire_editor_lock to check session_id (prevents same user multi-tab editing)
CREATE OR REPLACE FUNCTION acquire_editor_lock(
  p_restaurant_id UUID,
  p_user_email TEXT,
  p_user_name TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_lock_timeout_seconds INT DEFAULT 120
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_lock editor_locks%ROWTYPE;
  v_current_user_id UUID;
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
    ELSIF v_existing_lock.user_id = v_current_user_id AND v_existing_lock.session_id = p_session_id THEN
      -- Same user AND same session - renew the lock
      UPDATE editor_locks
      SET last_heartbeat = NOW()
      WHERE id = v_existing_lock.id;
      RETURN jsonb_build_object('success', true, 'message', 'Lock renewed');
    ELSIF v_existing_lock.user_id = v_current_user_id THEN
      -- Same user but DIFFERENT session (another tab/device) - block them too!
      RETURN jsonb_build_object(
        'success', false,
        'locked', true,
        'same_user', true,
        'locked_by_email', v_existing_lock.user_email,
        'locked_by_name', v_existing_lock.user_name,
        'locked_at', v_existing_lock.locked_at,
        'last_heartbeat', v_existing_lock.last_heartbeat
      );
    ELSE
      -- Different user has an active lock
      RETURN jsonb_build_object(
        'success', false,
        'locked', true,
        'same_user', false,
        'locked_by_email', v_existing_lock.user_email,
        'locked_by_name', v_existing_lock.user_name,
        'locked_at', v_existing_lock.locked_at,
        'last_heartbeat', v_existing_lock.last_heartbeat
      );
    END IF;
  END IF;

  -- Try to insert the lock
  BEGIN
    INSERT INTO editor_locks (restaurant_id, user_id, user_email, user_name, session_id)
    VALUES (p_restaurant_id, v_current_user_id, p_user_email, p_user_name, p_session_id);
    RETURN jsonb_build_object('success', true, 'message', 'Lock acquired');
  EXCEPTION WHEN unique_violation THEN
    -- Race condition - someone else got the lock
    SELECT * INTO v_existing_lock
    FROM editor_locks
    WHERE restaurant_id = p_restaurant_id;

    RETURN jsonb_build_object(
      'success', false,
      'locked', true,
      'same_user', v_existing_lock.user_id = v_current_user_id,
      'locked_by_email', v_existing_lock.user_email,
      'locked_by_name', v_existing_lock.user_name,
      'locked_at', v_existing_lock.locked_at,
      'last_heartbeat', v_existing_lock.last_heartbeat
    );
  END;
END;
$$;

-- Update release_editor_lock to use session_id
CREATE OR REPLACE FUNCTION release_editor_lock(p_restaurant_id UUID, p_session_id TEXT DEFAULT NULL)
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

  -- Only release if it's the same session (or no session specified for backwards compatibility)
  IF p_session_id IS NOT NULL THEN
    DELETE FROM editor_locks
    WHERE restaurant_id = p_restaurant_id
      AND user_id = v_current_user_id
      AND session_id = p_session_id;
  ELSE
    DELETE FROM editor_locks
    WHERE restaurant_id = p_restaurant_id
      AND user_id = v_current_user_id;
  END IF;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count > 0 THEN
    RETURN jsonb_build_object('success', true, 'message', 'Lock released');
  ELSE
    RETURN jsonb_build_object('success', true, 'message', 'No lock to release');
  END IF;
END;
$$;

-- Update heartbeat_editor_lock to use session_id
CREATE OR REPLACE FUNCTION heartbeat_editor_lock(p_restaurant_id UUID, p_session_id TEXT DEFAULT NULL)
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

  -- Only update heartbeat if it's the same session
  IF p_session_id IS NOT NULL THEN
    UPDATE editor_locks
    SET last_heartbeat = NOW()
    WHERE restaurant_id = p_restaurant_id
      AND user_id = v_current_user_id
      AND session_id = p_session_id;
  ELSE
    UPDATE editor_locks
    SET last_heartbeat = NOW()
    WHERE restaurant_id = p_restaurant_id
      AND user_id = v_current_user_id;
  END IF;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count > 0 THEN
    RETURN jsonb_build_object('success', true, 'message', 'Heartbeat updated');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Lock not found or not owned by this session');
  END IF;
END;
$$;
