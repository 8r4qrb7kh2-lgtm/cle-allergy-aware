-- Clarivore Menu Monitor Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Restaurants table
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    website_url TEXT NOT NULL,
    menu_page_url TEXT NOT NULL,
    manager_email VARCHAR(255) NOT NULL,
    manager_name VARCHAR(255),
    check_frequency VARCHAR(50) DEFAULT 'daily' CHECK (check_frequency IN ('hourly', 'daily', 'weekly')),
    is_active BOOLEAN DEFAULT true,
    last_checked_at TIMESTAMP,
    last_change_detected_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Menu snapshots table
CREATE TABLE menu_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_html TEXT, -- Compressed/stored for debugging
    page_hash VARCHAR(64), -- SHA-256 hash for quick comparison
    menu_items JSONB NOT NULL, -- Structured menu data
    ai_analysis JSONB, -- Claude's analysis
    item_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Detected changes table
CREATE TABLE menu_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    snapshot_id UUID REFERENCES menu_snapshots(id) ON DELETE SET NULL,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('added', 'removed', 'modified')),
    dish_name VARCHAR(255) NOT NULL,
    old_value JSONB, -- Previous state
    new_value JSONB, -- New state
    ai_suggested_allergens JSONB, -- AI-detected allergens
    ai_confidence DECIMAL(3,2), -- 0.00 to 1.00
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMP,
    manager_reviewed BOOLEAN DEFAULT false,
    manager_reviewed_at TIMESTAMP,
    manager_action VARCHAR(50), -- 'approved', 'rejected', 'modified'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email logs table
CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
    change_id UUID REFERENCES menu_changes(id) ON DELETE SET NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivery_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'
    error_message TEXT,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API tokens for Clarivore integration
CREATE TABLE api_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    description TEXT,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Monitoring jobs table (for tracking cron executions)
CREATE TABLE monitoring_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'running', -- 'running', 'completed', 'failed'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    restaurants_checked INTEGER DEFAULT 0,
    changes_detected INTEGER DEFAULT 0,
    errors JSONB,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_restaurants_active ON restaurants(is_active);
CREATE INDEX idx_restaurants_last_checked ON restaurants(last_checked_at);
CREATE INDEX idx_menu_snapshots_restaurant ON menu_snapshots(restaurant_id, captured_at DESC);
CREATE INDEX idx_menu_changes_restaurant ON menu_changes(restaurant_id, detected_at DESC);
CREATE INDEX idx_menu_changes_reviewed ON menu_changes(manager_reviewed);
CREATE INDEX idx_email_logs_sent ON email_logs(sent_at);
CREATE INDEX idx_monitoring_jobs_started ON monitoring_jobs(started_at DESC);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE restaurants IS 'Restaurants being monitored for menu changes';
COMMENT ON TABLE menu_snapshots IS 'Historical snapshots of restaurant menus';
COMMENT ON TABLE menu_changes IS 'Detected changes between menu versions';
COMMENT ON TABLE email_logs IS 'Log of all emails sent to managers';
COMMENT ON TABLE api_tokens IS 'API tokens for Clarivore integration';
COMMENT ON TABLE monitoring_jobs IS 'Tracking of scheduled monitoring jobs';
