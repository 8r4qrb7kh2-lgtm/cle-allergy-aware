-- Create table for "Something doesn't look right" product issue reports
CREATE TABLE IF NOT EXISTS product_issue_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_name TEXT,
    barcode TEXT,
    message TEXT NOT NULL,
    analysis_details JSONB,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    resolution_notes TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE product_issue_reports ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (reports are anonymous)
CREATE POLICY "Anyone can create product issue reports"
    ON product_issue_reports
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Only admins can read reports (we'll check via application logic)
CREATE POLICY "Authenticated users can read product issue reports"
    ON product_issue_reports
    FOR SELECT
    TO authenticated
    USING (true);

-- Only authenticated users can update (for admin resolution)
CREATE POLICY "Authenticated users can update product issue reports"
    ON product_issue_reports
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_product_issue_reports_status ON product_issue_reports(status);
CREATE INDEX idx_product_issue_reports_submitted_at ON product_issue_reports(submitted_at DESC);
