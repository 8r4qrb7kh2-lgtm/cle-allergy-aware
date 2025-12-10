-- Create a trigger function to queue feedback emails when orders are marked as delivered/completed
CREATE OR REPLACE FUNCTION queue_feedback_email_on_order_complete()
RETURNS TRIGGER AS $$
DECLARE
  order_payload jsonb;
  user_email text;
  user_allergens text[];
  user_diets text[];
  user_id_val uuid;
  scheduled_time timestamptz;
BEGIN
  -- Only trigger when status changes to 'delivered' or 'completed'
  IF NEW.status IN ('delivered', 'completed') AND (OLD.status IS NULL OR OLD.status NOT IN ('delivered', 'completed')) THEN
    -- Extract data from the payload
    order_payload := NEW.payload;

    -- Get user email from payload (could be stored in various ways)
    user_email := COALESCE(
      order_payload->>'userEmail',
      order_payload->>'email',
      order_payload->'user'->>'email'
    );

    -- Get user allergens and diets from payload
    user_allergens := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(order_payload->'allergies')),
      '{}'::text[]
    );
    user_diets := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(order_payload->'diets')),
      '{}'::text[]
    );

    -- Get user_id if available
    user_id_val := NULLIF(order_payload->>'userId', '')::uuid;

    -- Only queue email if we have an email address
    IF user_email IS NOT NULL AND user_email != '' THEN
      -- Schedule for 2 hours from now
      scheduled_time := NOW() + INTERVAL '2 hours';

      -- Insert into feedback email queue
      INSERT INTO feedback_email_queue (
        order_id,
        restaurant_id,
        user_id,
        user_email,
        user_allergens,
        user_diets,
        scheduled_for
      ) VALUES (
        NEW.id,
        NEW.restaurant_id,
        user_id_val,
        user_email,
        user_allergens,
        user_diets,
        scheduled_time
      )
      ON CONFLICT DO NOTHING; -- Avoid duplicate emails for same order
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on tablet_orders table
DROP TRIGGER IF EXISTS trigger_queue_feedback_email ON tablet_orders;

CREATE TRIGGER trigger_queue_feedback_email
  AFTER INSERT OR UPDATE OF status
  ON tablet_orders
  FOR EACH ROW
  EXECUTE FUNCTION queue_feedback_email_on_order_complete();

-- Add unique constraint to prevent duplicate emails for same order
ALTER TABLE feedback_email_queue
  ADD CONSTRAINT unique_order_feedback_email UNIQUE (order_id)
  ON CONFLICT DO NOTHING;

-- Note: You'll need to set up a cron job to call the send-feedback-email edge function
-- with action='process_queue' periodically (e.g., every 15 minutes)
-- Example using pg_cron (if available):
-- SELECT cron.schedule('process-feedback-emails', '*/15 * * * *',
--   $$SELECT net.http_post(
--     url := 'https://fgoiyycctnwnghrvsilt.supabase.co/functions/v1/send-feedback-email',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
--     body := '{"action": "process_queue"}'::jsonb
--   )$$
-- );
