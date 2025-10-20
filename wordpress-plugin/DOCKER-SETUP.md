# Docker WordPress Test Environment

## Prerequisites

- Docker Desktop installed (https://www.docker.com/products/docker-desktop/)

## Quick Start

### 1. Start WordPress

```bash
cd /Users/mattdavis/Documents/cle-allergy-aware/wordpress-plugin
docker-compose up -d
```

### 2. Install WordPress

1. Visit: http://localhost:8080
2. Select language: English
3. Click "Let's go!"
4. Database details are already configured, click "Run the installation"
5. Set up admin account:
   - Site Title: "Clarivore Test"
   - Username: admin
   - Password: (choose one)
   - Email: your@email.com
6. Click "Install WordPress"

### 3. Activate Plugin

1. Login at http://localhost:8080/wp-admin
2. Go to **Plugins**
3. Find "Clarivore Menu Integration"
4. Click **Activate**

### 4. Configure Plugin

1. Go to **Clarivore** in sidebar
2. Enter Restaurant Slug: "test-restaurant"
3. Check "Auto-Sync"
4. Save Settings

### 5. Test It

1. Go to **Menu Items > Add New**
2. Title: "Test Dish"
3. Description: "Contains dairy and eggs"
4. Scroll to Clarivore meta box
5. Check allergens
6. Click **Publish**

## Access Points

- **WordPress**: http://localhost:8080
- **Admin Panel**: http://localhost:8080/wp-admin
- **phpMyAdmin**: http://localhost:8081 (optional, for database inspection)

## Useful Commands

```bash
# Start WordPress
docker-compose up -d

# Stop WordPress
docker-compose down

# View logs
docker-compose logs -f

# Restart after code changes
docker-compose restart wordpress

# Stop and remove everything (fresh start)
docker-compose down -v
```

## Plugin Location

The plugin is automatically mounted at:
```
Container: /var/www/html/wp-content/plugins/clarivore-menu-integration
Host: /Users/mattdavis/Documents/cle-allergy-aware/wordpress-plugin/clarivore-menu-integration
```

Any changes you make to the plugin files on your Mac will instantly reflect in WordPress!

## Database Access

- **Host**: localhost:3306 (from host machine)
- **Database**: wordpress
- **User**: wordpress
- **Password**: wordpress
- **Root Password**: rootpassword

## Troubleshooting

### Port Already in Use

If port 8080 is taken, edit docker-compose.yml:
```yaml
ports:
  - "9090:80"  # Change 8080 to 9090
```

### Can't Connect to Database

Wait 30 seconds after `docker-compose up` - MySQL takes time to start.

### Fresh Install

```bash
docker-compose down -v  # Removes all data
docker-compose up -d    # Start fresh
```

## Testing Workflow

1. Make changes to plugin files on your Mac
2. Refresh WordPress admin page
3. See changes immediately
4. No need to restart Docker (files are mounted)

## Clean Up

When done testing:
```bash
# Stop containers (keeps data)
docker-compose down

# Remove everything including database
docker-compose down -v
```
