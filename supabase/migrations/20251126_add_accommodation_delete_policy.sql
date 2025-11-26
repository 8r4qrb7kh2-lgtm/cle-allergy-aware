-- Allow users to delete (withdraw) their own accommodation requests
CREATE POLICY "Users can delete own requests" ON accommodation_requests
  FOR DELETE USING (auth.uid() = user_id);
