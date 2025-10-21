# Clarivore Menu Monitor

Automated backend system for detecting menu changes on restaurant partner websites and notifying managers to update allergen information on Clarivore.

## Overview

This system periodically crawls restaurant websites, uses Claude AI to detect menu changes, and sends email notifications to managers with AI-suggested updates and direct links to the Clarivore menu editor.

## Features

- **Automated Menu Crawling**: Periodically scrapes restaurant websites
- **AI-Powered Change Detection**: Uses Claude AI (Anthropic) to analyze menus and detect changes
- **Smart Change Tracking**: Identifies additions, removals, and modifications to menu items
- **Allergen Focus**: Highlights critical allergen-related changes
- **Email Notifications**: Sends beautiful HTML emails with change summaries
- **Pre-filled Editor Links**: Direct links to Clarivore editor with suggested updates
- **RESTful API**: Complete API for managing restaurants and viewing changes
- **PostgreSQL Database**: Reliable data storage with full change history
- **Scheduled Jobs**: Configurable monitoring frequency per restaurant

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Restaurant Websites                   │
│          (GoDaddy, Wix, WordPress, Custom, etc.)        │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Scheduled crawling
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    Menu Scraper Service                  │
│         - Fetches HTML                                   │
│         - Extracts content                               │
│         - Generates content hash                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Sends content
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   Claude AI Service                      │
│         - Analyzes menu items                            │
│         - Identifies allergens                           │
│         - Detects changes                                │
│         - Generates AI suggestions                       │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Returns analysis
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                     │
│         - Stores snapshots                               │
│         - Tracks changes                                 │
│         - Logs emails                                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ If changes detected
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   Email Service                          │
│         - Renders HTML template                          │
│         - Generates editor links                         │
│         - Sends notification                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ Email with links
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Restaurant Manager                          │
│         - Receives notification                          │
│         - Clicks link                                    │
│         - Updates Clarivore                              │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Claude API key (from Anthropic)
- SMTP email service (Gmail, SendGrid, etc.)

## Installation

### 1. Clone and Install Dependencies

```bash
cd clarivore-menu-monitor
npm install
```

### 2. Set Up Database

Create a PostgreSQL database:

```sql
CREATE DATABASE clarivore_menu_monitor;
```

### 3. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/clarivore_menu_monitor

# Claude AI
CLAUDE_API_KEY=sk-ant-your-api-key-here

# Email Configuration
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=Clarivore Monitor <noreply@clarivore.com>

# Clarivore Integration
CLARIVORE_EDITOR_URL=https://clarivore.com/editor

# Server
PORT=3000
NODE_ENV=development

# Scheduler
ENABLE_SCHEDULER=true
```

### 4. Run Database Migration

```bash
npm run db:migrate
```

This creates all necessary tables:
- `restaurants` - Restaurant information
- `menu_snapshots` - Historical menu data
- `menu_changes` - Detected changes
- `email_logs` - Email notification history
- `api_tokens` - API authentication (future use)
- `monitoring_jobs` - Job execution logs

### 5. Seed Test Data (Optional)

```bash
npm run db:seed
```

This adds 4 sample restaurants for testing.

## Usage

### Start the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will:
1. Start API server on port 3000 (or configured PORT)
2. Start monitoring scheduler (runs every hour by default)

### API Endpoints

#### Restaurants

- `GET /api/restaurants` - List all restaurants
- `GET /api/restaurants/:id` - Get restaurant details
- `POST /api/restaurants` - Add new restaurant
- `PUT /api/restaurants/:id` - Update restaurant
- `DELETE /api/restaurants/:id` - Delete restaurant
- `GET /api/restaurants/:id/history` - Get change history
- `GET /api/restaurants/:id/latest-snapshot` - Get latest menu snapshot

#### Changes

- `GET /api/changes` - List all changes
- `GET /api/changes/:id` - Get change details
- `PUT /api/changes/:id/review` - Mark change as reviewed
- `GET /api/changes/stats/summary` - Get statistics
- `GET /api/changes/recent/critical` - Get unreviewed critical changes

#### Monitoring

- `POST /api/monitoring/check/:restaurantId` - Manually trigger check
- `POST /api/monitoring/check-all` - Check all active restaurants
- `GET /api/monitoring/jobs` - Get job history
- `GET /api/monitoring/jobs/:id` - Get job details

#### Webhooks

- `POST /api/webhooks/clarivore/dish-updated` - Webhook from Clarivore
- `POST /api/webhooks/clarivore/review-completed` - Review completion webhook
- `POST /api/webhooks/test` - Test webhook

### Add a Restaurant

```bash
curl -X POST http://localhost:3000/api/restaurants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bella Italia",
    "menuUrl": "https://bellaitalia.com/menu",
    "managerEmail": "manager@bellaitalia.com",
    "managerName": "Maria Rossi",
    "checkFrequency": "1 hour",
    "active": true
  }'
```

### Manually Check for Changes

```bash
curl -X POST http://localhost:3000/api/monitoring/check/{restaurant-id}
```

### Test Email Notification

```bash
TEST_EMAIL=your-email@example.com npm run test:email
```

## How It Works

### 1. Scheduled Monitoring

The scheduler runs monitoring jobs based on configuration:
- **Hourly**: Checks all active restaurants
- **Daily Summary**: 9 AM daily (unreviewed changes)
- **Cleanup**: Sundays at 2 AM (removes old logs)

### 2. Change Detection Process

For each restaurant:

1. **Scrape**: Fetch current menu HTML
2. **Extract**: Parse and extract menu content
3. **Hash**: Generate SHA-256 hash for quick comparison
4. **Compare**: Check if hash differs from previous snapshot
5. **Analyze**: If changed, send to Claude AI for detailed analysis
6. **Store**: Save new snapshot to database
7. **Notify**: If changes detected, send email to manager

### 3. Email Notification

When changes are detected:

1. **Generate**: Create HTML email with change summary
2. **Build Links**: Create Clarivore editor URLs with pre-filled data
3. **Send**: Deliver email via configured SMTP
4. **Log**: Record email status in database

### 4. Manager Action

Manager receives email with:
- Summary of all changes (added/removed/modified)
- Allergen information highlighted
- Critical changes marked urgently
- Direct links to Clarivore editor for each change
- Pre-filled tentative updates from AI

### 5. Clarivore Integration

Editor URLs include query parameters:
```
https://clarivore.com/editor/dish/new?
  changeId=abc123&
  action=add&
  name=Mushroom+Risotto&
  allergens=["dairy","gluten"]&
  ...
```

Clarivore can:
- Pre-fill the dish editor with suggested data
- Allow manager to review and confirm
- Send webhook back when updated

## Database Schema

### restaurants
- `id` - UUID primary key
- `name` - Restaurant name
- `menu_url` - URL to monitor
- `manager_email` - Notification recipient
- `manager_name` - Manager's name
- `check_frequency` - How often to check
- `active` - Enable/disable monitoring
- `created_at`, `updated_at` - Timestamps

### menu_snapshots
- `id` - UUID primary key
- `restaurant_id` - Foreign key
- `content_hash` - SHA-256 of content
- `menu_data` - Full AI analysis (JSONB)
- `raw_content` - Original text
- `scraped_at` - Timestamp

### menu_changes
- `id` - UUID primary key
- `restaurant_id` - Foreign key
- `snapshot_id` - Foreign key
- `changes_detected` - Change details (JSONB)
- `ai_suggestions` - AI recommendations (JSONB)
- `critical` - Allergen-related flag
- `reviewed` - Manager reviewed flag
- `reviewed_at`, `reviewed_by` - Review tracking
- `detected_at` - Timestamp

### email_logs
- Track all sent emails
- Success/failure status
- Error messages

### monitoring_jobs
- Job execution history
- Performance metrics
- Error tracking

## Development

### Project Structure

```
clarivore-menu-monitor/
├── src/
│   ├── api/
│   │   ├── server.js              # Express app
│   │   └── routes/
│   │       ├── restaurants.js     # Restaurant CRUD
│   │       ├── changes.js         # Change management
│   │       ├── monitoring.js      # Manual triggers
│   │       └── webhooks.js        # Clarivore webhooks
│   ├── database/
│   │   ├── db.js                  # PostgreSQL connection
│   │   ├── schema.sql             # Database schema
│   │   ├── migrate.js             # Migration script
│   │   └── seed.js                # Test data
│   ├── services/
│   │   ├── scraper.js             # Web scraping
│   │   ├── claude.js              # AI analysis
│   │   └── email.js               # Email notifications
│   ├── jobs/
│   │   └── scheduler.js           # Cron jobs
│   ├── templates/
│   │   └── emails/
│   │       └── menu-change-notification.ejs
│   └── index.js                   # Main entry point
├── .env.example                   # Environment template
├── package.json
└── README.md
```

### Running Tests

```bash
npm test
```

### Adding New Features

1. **New API Endpoint**: Add route in `src/api/routes/`
2. **New Service**: Create in `src/services/`
3. **Database Changes**: Update `schema.sql` and re-run migration
4. **Email Template**: Add EJS file in `src/templates/emails/`

## Deployment

### Environment Setup

Production environment variables:

```env
NODE_ENV=production
DATABASE_URL=postgresql://prod-user:password@db.server:5432/clarivore
CLAUDE_API_KEY=sk-ant-production-key
SMTP_HOST=smtp.sendgrid.net
SMTP_USER=apikey
SMTP_PASSWORD=SG.production-key
CLARIVORE_EDITOR_URL=https://app.clarivore.com/editor
ENABLE_SCHEDULER=true
```

### Using PM2 (Recommended)

```bash
npm install -g pm2

# Start
pm2 start src/index.js --name clarivore-monitor

# View logs
pm2 logs clarivore-monitor

# Restart
pm2 restart clarivore-monitor

# Auto-restart on reboot
pm2 startup
pm2 save
```

### Using Docker

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
```

```bash
docker build -t clarivore-monitor .
docker run -d --env-file .env -p 3000:3000 clarivore-monitor
```

## Monitoring & Maintenance

### Check System Health

```bash
curl http://localhost:3000/health
```

### View Recent Jobs

```bash
curl http://localhost:3000/api/monitoring/jobs?limit=10
```

### View Unreviewed Changes

```bash
curl http://localhost:3000/api/changes/recent/critical
```

### Database Cleanup

The system automatically cleans up:
- Email logs older than 90 days
- Job logs older than 30 days
- Keeps only last 10 snapshots per restaurant

Runs weekly (Sundays at 2 AM).

## Troubleshooting

### Email Not Sending

1. Check SMTP credentials in `.env`
2. For Gmail, use App Password (not regular password)
3. Check email logs: `SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 10;`

### Changes Not Detected

1. Verify restaurant is active: `SELECT * FROM restaurants WHERE id = 'xxx';`
2. Check recent jobs: `GET /api/monitoring/jobs`
3. Manually trigger check: `POST /api/monitoring/check/:id`
4. Review Claude API usage and limits

### Database Connection Issues

1. Verify DATABASE_URL is correct
2. Ensure PostgreSQL is running
3. Check firewall/network access
4. Test connection: `psql $DATABASE_URL`

### Scheduler Not Running

1. Check `ENABLE_SCHEDULER=true` in `.env`
2. Look for startup logs
3. Verify cron expressions are valid
4. Check for errors in job logs

## Cost Considerations

### Claude API

- ~$0.003 per request (Sonnet 4.5)
- For 100 restaurants checked hourly: ~$216/month
- Optimize with content hashing (only analyzes when changed)

### Email (SendGrid)

- Free tier: 100 emails/day
- Paid: $15/month for 40,000 emails

### Database

- Small PostgreSQL instance: $7-25/month
- Storage grows ~1GB/year for 100 restaurants

## Security

- API tokens for authentication (implement as needed)
- Webhook signature verification
- Environment variables for secrets
- SQL injection prevention (parameterized queries)
- CORS configuration
- Rate limiting (add as needed)

## Future Enhancements

- [ ] Web-based admin dashboard
- [ ] Manager authentication portal
- [ ] Multi-language support
- [ ] Image-based menu OCR
- [ ] SMS notifications
- [ ] Analytics and reporting
- [ ] Restaurant-specific allergen profiles
- [ ] Integration with POS systems

## Support

For issues or questions:
1. Check logs: `pm2 logs` or console output
2. Review database: Check tables for error states
3. Test individual components (email, scraper, Claude)
4. Contact Clarivore development team

## License

MIT - See LICENSE file

---

**Built for Clarivore** - Helping restaurants keep allergen information accurate and up-to-date.
