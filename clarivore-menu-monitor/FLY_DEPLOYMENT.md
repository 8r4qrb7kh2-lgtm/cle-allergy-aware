# Deploy to Fly.io (No Credit Card Required!)

Fly.io offers a truly free tier without requiring a credit card. Perfect for running your menu monitor 24/7!

## Step 1: Install Fly CLI

```bash
# On macOS
brew install flyctl

# Or use the install script
curl -L https://fly.io/install.sh | sh
```

## Step 2: Sign Up and Login

```bash
# Sign up (no credit card required!)
flyctl auth signup

# Or login if you have an account
flyctl auth login
```

## Step 3: Create PostgreSQL Database

```bash
cd /Users/mattdavis/Documents/clarivore-main/clarivore-menu-monitor

# Create a Postgres database (free tier)
flyctl postgres create --name clarivore-db --region ord --initial-cluster-size 1 --vm-size shared-cpu-1x --volume-size 1
```

Save the connection string that's displayed!

## Step 4: Launch the App

```bash
# Initialize the app (this will use the existing fly.toml)
flyctl launch --no-deploy

# Set environment variables (use your actual values from .env file)
flyctl secrets set \
  DATABASE_URL="<your-postgres-connection-string-from-step-3>" \
  CLAUDE_API_KEY="<your-claude-api-key>" \
  SENDGRID_API_KEY="<your-sendgrid-api-key>" \
  EMAIL_FROM="Clarivore Monitor <clarivoretesting@gmail.com>" \
  EMAIL_PROVIDER="sendgrid" \
  CLARIVORE_EDITOR_URL="https://clarivore.com/editor" \
  NODE_ENV="production" \
  ENABLE_SCHEDULER="true"

# Deploy the app
flyctl deploy
```

## Step 5: Run Database Migrations

```bash
# Connect to your app's console
flyctl ssh console

# Inside the console, run migrations
npm run db:migrate
npm run db:seed
exit
```

## Step 6: Get Your App URL

```bash
flyctl status
```

Your app will be available at: `https://clarivore-menu-monitor.fly.dev`

Test it: `https://clarivore-menu-monitor.fly.dev/health`

## What You Get (FREE!)

✅ **256MB RAM** - Enough for your Node.js app
✅ **1GB Storage** - PostgreSQL database included
✅ **Always On** - Runs 24/7
✅ **Automatic Hourly Checks** - Scheduler works perfectly
✅ **No Credit Card** - Completely free
✅ **HTTPS Enabled** - Secure by default

## Monitoring

```bash
# View logs
flyctl logs

# Check app status
flyctl status

# SSH into the app
flyctl ssh console
```

## Update Dashboard

After deployment, update your dashboard's environment variable:

```bash
cd /Users/mattdavis/Documents/clarivore-main/clarivore-monitor-dashboard

# Update Vercel environment variable
vercel env add VITE_API_URL production
# Enter: https://clarivore-menu-monitor.fly.dev/api

# Redeploy dashboard
vercel --prod
```

## Troubleshooting

### App Not Starting
Check logs: `flyctl logs`

### Database Connection Issues
Verify DATABASE_URL is set: `flyctl secrets list`

### Scheduler Not Running
Check logs for: `[Scheduler] Starting monitoring jobs...`

## Done!

Your menu monitor is now running 24/7 on Fly.io's free tier with:
- Automated hourly checks
- PostgreSQL database
- Email notifications
- No credit card required!
