# Quick Start - Set Up WordPress Test Site

## The Absolute Fastest Way

### Option 1: Docker (2 minutes) ⚡

**If you have Docker installed:**

```bash
cd /Users/mattdavis/Documents/cle-allergy-aware/wordpress-plugin
docker-compose up -d
```

Wait 30 seconds, then visit: **http://localhost:8080**

That's it! WordPress is running with your plugin already installed.

📖 Full instructions: [DOCKER-SETUP.md](DOCKER-SETUP.md)

---

### Option 2: Run Setup Script

```bash
cd /Users/mattdavis/Documents/cle-allergy-aware/wordpress-plugin
./setup-test-site.sh
```

The script will:
- Check what you have installed
- Guide you through setup
- Provide specific instructions

---

### Option 3: Local by Flywheel (5 minutes) 🎯

**Best for beginners:**

1. **Download Local**
   - https://localwp.com/ (Free)
   - Install and open

2. **Create Site**
   - Click "Create a new site"
   - Name: "clarivore-test"
   - Use defaults
   - Create admin account

3. **Install Plugin**
   ```bash
   cp -r clarivore-menu-integration \
         ~/Local\ Sites/clarivore-test/app/public/wp-content/plugins/
   ```

4. **Activate**
   - Click "Admin" button in Local
   - Go to Plugins
   - Activate "Clarivore Menu Integration"

---

## After WordPress is Running

### 1. Complete WordPress Setup (First Time Only)

Visit your WordPress site and complete the 5-minute installation:
- Choose language
- Set site title: "Clarivore Test"
- Create admin account
- Install WordPress

### 2. Activate Plugin

1. Login to WordPress admin
2. Go to **Plugins**
3. Find "Clarivore Menu Integration"
4. Click **Activate**

### 3. Configure Clarivore

1. Go to **Clarivore** in sidebar
2. Restaurant Slug: "test-restaurant"
3. Check **Auto-Sync**
4. Click **Save Settings**

### 4. Test It

1. **Menu Items > Add New**
2. Title: "Grilled Salmon"
3. Description: "Fresh Atlantic salmon with lemon"
4. Scroll to **Clarivore** meta box
5. Check **Fish** allergen
6. Check **Gluten-Free** diet
7. Click **Publish**

### 5. Verify Sync (Optional)

Check your Supabase database to see if the menu item synced!

---

## Troubleshooting

### "Can't connect to Docker"
```bash
# Make sure Docker Desktop is running
open -a Docker

# Wait for it to start, then try again
docker-compose up -d
```

### "Port 8080 already in use"
Edit `docker-compose.yml` and change:
```yaml
ports:
  - "9090:80"  # Changed from 8080
```

### "Local by Flywheel site not found"
Make sure you created the site in Local first, then copy the plugin.

### "Plugin doesn't appear in WordPress"
Check that you copied it to the correct location:
```bash
# For Docker:
ls -la clarivore-menu-integration/

# For Local:
ls -la ~/Local\ Sites/clarivore-test/app/public/wp-content/plugins/clarivore-menu-integration/
```

---

## What's Next?

Once WordPress is running and the plugin is activated:

1. **Test the features** - Use the [TESTING-CHECKLIST.md](TESTING-CHECKLIST.md)
2. **Try examples** - See [USAGE-EXAMPLES.md](clarivore-menu-integration/USAGE-EXAMPLES.md)
3. **Read docs** - Check [README.md](clarivore-menu-integration/README.md)

---

## Need More Help?

- **Docker Setup**: [DOCKER-SETUP.md](DOCKER-SETUP.md)
- **Plugin Installation**: [clarivore-menu-integration/INSTALL.md](clarivore-menu-integration/INSTALL.md)
- **Full Documentation**: [clarivore-menu-integration/README.md](clarivore-menu-integration/README.md)
- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Quick Reference

| Method | Setup Time | Best For |
|--------|-----------|----------|
| Docker | 2 min | Developers |
| Local | 5 min | Everyone |
| MAMP | 10 min | Traditional |

**Recommendation**: Use Docker if you're comfortable with it, otherwise use Local by Flywheel.
