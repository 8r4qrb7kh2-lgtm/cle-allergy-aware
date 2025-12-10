-- Create order_feedback table for storing customer feedback after orders
CREATE TABLE IF NOT EXISTS order_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Feedback content
  restaurant_feedback text,
  website_feedback text,

  -- Allow follow-up flags
  restaurant_feedback_include_email boolean DEFAULT false,
  website_feedback_include_email boolean DEFAULT false,
  user_email text,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create accommodation_requests table for dish accommodation requests
CREATE TABLE IF NOT EXISTS accommodation_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback_id uuid REFERENCES order_feedback(id) ON DELETE CASCADE,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Dish info
  dish_name text NOT NULL,
  user_allergens text[] DEFAULT '{}',
  user_diets text[] DEFAULT '{}',

  -- Status tracking
  status text DEFAULT 'pending', -- pending, acknowledged, implemented, declined
  manager_response text,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create feedback_email_queue table to track when to send feedback emails
CREATE TABLE IF NOT EXISTS feedback_email_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  user_id uuid,
  user_email text NOT NULL,
  user_allergens text[] DEFAULT '{}',
  user_diets text[] DEFAULT '{}',

  -- Scheduling
  scheduled_for timestamptz NOT NULL, -- 2 hours after order completion
  sent_at timestamptz,

  -- Token for secure access to feedback page
  feedback_token uuid DEFAULT gen_random_uuid() UNIQUE,

  -- Metadata
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_feedback_order ON order_feedback(order_id);
CREATE INDEX IF NOT EXISTS idx_order_feedback_restaurant ON order_feedback(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_requests_restaurant ON accommodation_requests(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_requests_status ON accommodation_requests(status);
CREATE INDEX IF NOT EXISTS idx_feedback_email_queue_scheduled ON feedback_email_queue(scheduled_for) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_feedback_email_queue_token ON feedback_email_queue(feedback_token);

-- Enable RLS
ALTER TABLE order_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE accommodation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_email_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for order_feedback
DROP POLICY IF EXISTS "Users can insert feedback" ON order_feedback;
CREATE POLICY "Users can insert feedback" ON order_feedback
  FOR INSERT
  WITH CHECK (true); -- Allow anonymous feedback via token

DROP POLICY IF EXISTS "Users can read own feedback" ON order_feedback;
CREATE POLICY "Users can read own feedback" ON order_feedback
  FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Managers can read restaurant feedback" ON order_feedback;
CREATE POLICY "Managers can read restaurant feedback" ON order_feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_managers
      WHERE restaurant_managers.restaurant_id = order_feedback.restaurant_id
      AND restaurant_managers.user_id = auth.uid()
    )
  );

-- RLS Policies for accommodation_requests
DROP POLICY IF EXISTS "Users can insert accommodation requests" ON accommodation_requests;
CREATE POLICY "Users can insert accommodation requests" ON accommodation_requests
  FOR INSERT
  WITH CHECK (true); -- Allow anonymous requests via token

DROP POLICY IF EXISTS "Users can read own requests" ON accommodation_requests;
CREATE POLICY "Users can read own requests" ON accommodation_requests
  FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Managers can manage restaurant requests" ON accommodation_requests;
CREATE POLICY "Managers can manage restaurant requests" ON accommodation_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_managers
      WHERE restaurant_managers.restaurant_id = accommodation_requests.restaurant_id
      AND restaurant_managers.user_id = auth.uid()
    )
  );

-- RLS Policies for feedback_email_queue
DROP POLICY IF EXISTS "Service role can manage email queue" ON feedback_email_queue;
CREATE POLICY "Service role can manage email queue" ON feedback_email_queue
  FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Anyone can read by token" ON feedback_email_queue;
CREATE POLICY "Anyone can read by token" ON feedback_email_queue
  FOR SELECT
  USING (true); -- Token validation happens in application layer

-- Grant permissions
GRANT SELECT, INSERT ON order_feedback TO authenticated;
GRANT SELECT, INSERT ON accommodation_requests TO authenticated;
GRANT SELECT ON feedback_email_queue TO authenticated;

-- Allow anon users to insert feedback (via token)
GRANT INSERT ON order_feedback TO anon;
GRANT INSERT ON accommodation_requests TO anon;
GRANT SELECT ON feedback_email_queue TO anon;
