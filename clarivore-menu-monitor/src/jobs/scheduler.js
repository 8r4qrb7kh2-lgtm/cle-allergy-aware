const cron = require('node-cron');
const { query } = require('../database/db');
const scraper = require('../services/scraper');
const claudeService = require('../services/claude');
const emailService = require('../services/email');

/**
 * Menu monitoring job scheduler
 */
class MonitoringScheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Start all scheduled jobs
   */
  start() {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log('[Scheduler] Starting monitoring jobs...');

    // Main monitoring job - runs every hour
    const hourlyJob = cron.schedule('0 * * * *', async () => {
      await this.runMonitoringCycle();
    });

    this.jobs.set('hourly', hourlyJob);

    // Daily summary job - runs at 9 AM every day
    const dailySummaryJob = cron.schedule('0 9 * * *', async () => {
      await this.sendDailySummary();
    });

    this.jobs.set('dailySummary', dailySummaryJob);

    // Cleanup old logs - runs weekly on Sunday at 2 AM
    const cleanupJob = cron.schedule('0 2 * * 0', async () => {
      await this.cleanupOldLogs();
    });

    this.jobs.set('cleanup', cleanupJob);

    this.isRunning = true;
    console.log('[Scheduler] ✓ All jobs started');
    console.log('[Scheduler] - Hourly monitoring: Every hour');
    console.log('[Scheduler] - Daily summary: 9:00 AM daily');
    console.log('[Scheduler] - Cleanup: Sundays at 2:00 AM');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    console.log('[Scheduler] Stopping all jobs...');

    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`[Scheduler] Stopped: ${name}`);
    }

    this.jobs.clear();
    this.isRunning = false;
    console.log('[Scheduler] All jobs stopped');
  }

  /**
   * Run a single monitoring cycle for all active restaurants
   */
  async runMonitoringCycle() {
    const jobId = await this.logJobStart();

    try {
      console.log('[Scheduler] ========================================');
      console.log('[Scheduler] Starting monitoring cycle...');

      // Get all active restaurants
      const result = await query(
        'SELECT * FROM restaurants WHERE active = true ORDER BY name'
      );

      const restaurants = result.rows;
      console.log(`[Scheduler] Found ${restaurants.length} active restaurants`);

      let totalChecked = 0;
      let changesDetected = 0;
      let errors = 0;

      for (const restaurant of restaurants) {
        try {
          console.log(`[Scheduler] Checking: ${restaurant.name}`);

          const hasChanges = await this.checkRestaurant(restaurant);

          totalChecked++;
          if (hasChanges) {
            changesDetected++;
            console.log(`[Scheduler] ✓ Changes detected at ${restaurant.name}`);
          } else {
            console.log(`[Scheduler] - No changes at ${restaurant.name}`);
          }

          // Small delay between checks to avoid rate limiting
          await this.delay(2000);

        } catch (error) {
          errors++;
          console.error(`[Scheduler] ✗ Error checking ${restaurant.name}:`, error.message);
        }
      }

      await this.logJobEnd(jobId, {
        status: 'completed',
        totalChecked,
        changesDetected,
        errors
      });

      console.log('[Scheduler] Cycle complete:');
      console.log(`[Scheduler] - Checked: ${totalChecked}`);
      console.log(`[Scheduler] - Changes: ${changesDetected}`);
      console.log(`[Scheduler] - Errors: ${errors}`);
      console.log('[Scheduler] ========================================');

    } catch (error) {
      console.error('[Scheduler] Monitoring cycle failed:', error);
      await this.logJobEnd(jobId, {
        status: 'failed',
        error: error.message
      });
    }
  }

  /**
   * Check a single restaurant for menu changes
   */
  async checkRestaurant(restaurant) {
    // Scrape current menu
    const scrapedContent = await scraper.scrape(restaurant.menu_page_url);

    // Get previous snapshot
    const previousResult = await query(
      `SELECT * FROM menu_snapshots
       WHERE restaurant_id = $1
       ORDER BY scraped_at DESC
       LIMIT 1`,
      [restaurant.id]
    );

    const previousSnapshot = previousResult.rows[0];

    // Quick hash comparison
    if (previousSnapshot && previousSnapshot.content_hash === scrapedContent.contentHash) {
      return false; // No changes
    }

    // Analyze with Claude
    const previousMenu = previousSnapshot ? previousSnapshot.menu_data : null;
    const analysis = await claudeService.analyzeMenu(scrapedContent, previousMenu);

    // Save snapshot
    const snapshotResult = await query(
      `INSERT INTO menu_snapshots
       (restaurant_id, content_hash, menu_data, raw_content)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        restaurant.id,
        scrapedContent.contentHash,
        JSON.stringify(analysis),
        scrapedContent.text
      ]
    );

    const snapshotId = snapshotResult.rows[0].id;

    // If changes detected, save and notify
    if (analysis.hasChanges && analysis.changes) {
      const isCritical = claudeService.hasCriticalChanges(analysis.changes);

      const changeResult = await query(
        `INSERT INTO menu_changes
         (restaurant_id, snapshot_id, changes_detected, ai_suggestions, critical)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          restaurant.id,
          snapshotId,
          JSON.stringify(analysis.changes),
          JSON.stringify(analysis.changes),
          isCritical
        ]
      );

      const changeId = changeResult.rows[0].id;

      // Send notification email
      try {
        await emailService.sendMenuChangeNotification({
          managerEmail: restaurant.manager_email,
          managerName: restaurant.manager_name || 'Manager',
          restaurantName: restaurant.name,
          changes: analysis.changes,
          analysis,
          menuUrl: restaurant.menu_page_url,
          changeId
        });

        // Log email sent
        await query(
          `INSERT INTO email_logs
           (restaurant_id, change_id, recipient, subject, sent_successfully)
           VALUES ($1, $2, $3, $4, true)`,
          [
            restaurant.id,
            changeId,
            restaurant.manager_email,
            emailService.buildSubject(restaurant.name, analysis.changes)
          ]
        );

        console.log(`[Scheduler]   ✉️  Notification sent to ${restaurant.manager_email}`);
      } catch (emailError) {
        console.error(`[Scheduler]   ✗ Email failed:`, emailError.message);

        await query(
          `INSERT INTO email_logs
           (restaurant_id, change_id, recipient, error_message, sent_successfully)
           VALUES ($1, $2, $3, $4, false)`,
          [restaurant.id, changeId, restaurant.manager_email, emailError.message]
        );
      }

      return true; // Changes detected
    }

    return false; // No changes
  }

  /**
   * Send daily summary of changes
   */
  async sendDailySummary() {
    console.log('[Scheduler] Generating daily summary...');

    try {
      // Get all unreviewed changes from last 24 hours
      const result = await query(
        `SELECT
           mc.*,
           r.name as restaurant_name,
           r.manager_email
         FROM menu_changes mc
         JOIN restaurants r ON mc.restaurant_id = r.id
         WHERE mc.detected_at > NOW() - INTERVAL '24 hours'
           AND mc.reviewed = false
         ORDER BY mc.critical DESC, mc.detected_at DESC`
      );

      const unreviewedChanges = result.rows;

      if (unreviewedChanges.length === 0) {
        console.log('[Scheduler] No unreviewed changes - skipping summary');
        return;
      }

      console.log(`[Scheduler] Found ${unreviewedChanges.length} unreviewed changes`);

      // Group by restaurant
      const byRestaurant = unreviewedChanges.reduce((acc, change) => {
        const key = change.restaurant_id;
        if (!acc[key]) {
          acc[key] = {
            restaurantName: change.restaurant_name,
            managerEmail: change.manager_email,
            changes: []
          };
        }
        acc[key].changes.push(change);
        return acc;
      }, {});

      // TODO: Send summary emails
      // This would require creating a summary email template
      console.log(`[Scheduler] Daily summary prepared for ${Object.keys(byRestaurant).length} restaurants`);

    } catch (error) {
      console.error('[Scheduler] Failed to generate daily summary:', error);
    }
  }

  /**
   * Cleanup old logs and snapshots
   */
  async cleanupOldLogs() {
    console.log('[Scheduler] Running cleanup...');

    try {
      // Delete email logs older than 90 days
      const emailResult = await query(
        `DELETE FROM email_logs
         WHERE sent_at < NOW() - INTERVAL '90 days'`
      );

      // Delete monitoring jobs older than 30 days
      const jobResult = await query(
        `DELETE FROM monitoring_jobs
         WHERE started_at < NOW() - INTERVAL '30 days'`
      );

      // Keep only last 10 snapshots per restaurant
      await query(
        `DELETE FROM menu_snapshots
         WHERE id NOT IN (
           SELECT id FROM (
             SELECT id, ROW_NUMBER() OVER (PARTITION BY restaurant_id ORDER BY scraped_at DESC) as rn
             FROM menu_snapshots
           ) t WHERE rn <= 10
         )`
      );

      console.log(`[Scheduler] Cleanup complete:`);
      console.log(`[Scheduler] - Deleted ${emailResult.rowCount} old email logs`);
      console.log(`[Scheduler] - Deleted ${jobResult.rowCount} old job records`);
      console.log(`[Scheduler] - Cleaned up old snapshots`);

    } catch (error) {
      console.error('[Scheduler] Cleanup failed:', error);
    }
  }

  /**
   * Log job start
   */
  async logJobStart() {
    const result = await query(
      `INSERT INTO monitoring_jobs (job_type, status, started_at)
       VALUES ('scheduled_check', 'running', NOW())
       RETURNING id`
    );
    return result.rows[0].id;
  }

  /**
   * Log job end
   */
  async logJobEnd(jobId, { status, totalChecked = 0, changesDetected = 0, errors = 0, error = null }) {
    await query(
      `UPDATE monitoring_jobs
       SET
         status = $1,
         completed_at = NOW(),
         restaurants_checked = $2,
         changes_found = $3,
         errors = $4,
         error_message = $5
       WHERE id = $6`,
      [status, totalChecked, changesDetected, errors, error, jobId]
    );
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Run monitoring cycle immediately (for testing)
   */
  async runNow() {
    console.log('[Scheduler] Running immediate check...');
    await this.runMonitoringCycle();
  }
}

module.exports = new MonitoringScheduler();
