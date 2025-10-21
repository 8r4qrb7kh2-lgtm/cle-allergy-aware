const express = require('express');
const router = express.Router();
const { query } = require('../../database/db');
const scraper = require('../../services/scraper');
const claudeService = require('../../services/claude');
const emailService = require('../../services/email');
const crypto = require('crypto');

/**
 * POST /api/monitoring/check/:restaurantId
 * Manually trigger a menu check for a restaurant
 */
router.post('/check/:restaurantId', async (req, res, next) => {
  try {
    const { restaurantId } = req.params;

    // Get restaurant details
    const restaurantResult = await query(
      'SELECT * FROM restaurants WHERE id = $1',
      [restaurantId]
    );

    if (restaurantResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Restaurant not found'
      });
    }

    const restaurant = restaurantResult.rows[0];

    console.log(`[Monitoring] Manual check triggered for ${restaurant.name}`);

    // Scrape current menu
    const scrapedContent = await scraper.scrape(restaurant.menu_page_url);

    // Get previous snapshot
    const previousResult = await query(
      `SELECT * FROM menu_snapshots
       WHERE restaurant_id = $1
       ORDER BY captured_at DESC
       LIMIT 1`,
      [restaurantId]
    );

    const previousSnapshot = previousResult.rows[0];

    // Check if content changed
    if (previousSnapshot && previousSnapshot.page_hash === scrapedContent.contentHash) {
      console.log(`[Monitoring] No changes detected for ${restaurant.name}`);
      return res.json({
        success: true,
        hasChanges: false,
        message: 'No changes detected'
      });
    }

    // Analyze with Claude AI
    const previousMenu = previousSnapshot ? previousSnapshot.ai_analysis : null;
    const analysis = await claudeService.analyzeMenu(scrapedContent, previousMenu);

    // Save snapshot
    const snapshotResult = await query(
      `INSERT INTO menu_snapshots
       (restaurant_id, page_hash, menu_items, ai_analysis, raw_html)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        restaurantId,
        scrapedContent.contentHash,
        JSON.stringify(analysis.menuItems || []),
        JSON.stringify(analysis),
        scrapedContent.html || scrapedContent.text
      ]
    );

    const snapshotId = snapshotResult.rows[0].id;

    // If changes detected, save and notify
    if (analysis.hasChanges && analysis.changes) {
      const changeIds = [];
      let hasCritical = false;

      // Insert individual change records for added items
      if (analysis.changes.added && analysis.changes.added.length > 0) {
        for (const item of analysis.changes.added) {
          const isCritical = item.allergens && item.allergens.length > 0;
          if (isCritical) hasCritical = true;

          const result = await query(
            `INSERT INTO menu_changes
             (restaurant_id, snapshot_id, change_type, dish_name, new_value, ai_suggested_allergens)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              restaurantId,
              snapshotId,
              'added',
              item.name,
              JSON.stringify(item),
              JSON.stringify(item.allergens || [])
            ]
          );
          changeIds.push(result.rows[0].id);
        }
      }

      // Insert individual change records for removed items
      if (analysis.changes.removed && analysis.changes.removed.length > 0) {
        for (const item of analysis.changes.removed) {
          const result = await query(
            `INSERT INTO menu_changes
             (restaurant_id, snapshot_id, change_type, dish_name, old_value)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [
              restaurantId,
              snapshotId,
              'removed',
              item.name,
              JSON.stringify(item)
            ]
          );
          changeIds.push(result.rows[0].id);
        }
      }

      // Insert individual change records for modified items
      if (analysis.changes.modified && analysis.changes.modified.length > 0) {
        for (const change of analysis.changes.modified) {
          const isCritical = change.criticalChange || change.field === 'allergens';
          if (isCritical) hasCritical = true;

          const result = await query(
            `INSERT INTO menu_changes
             (restaurant_id, snapshot_id, change_type, dish_name, old_value, new_value, ai_suggested_allergens)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              restaurantId,
              snapshotId,
              'modified',
              change.name,
              JSON.stringify({ [change.field]: change.oldValue }),
              JSON.stringify({ [change.field]: change.newValue }),
              JSON.stringify(change.suggestedAllergens || [])
            ]
          );
          changeIds.push(result.rows[0].id);
        }
      }

      // Send email notification with first change ID
      const primaryChangeId = changeIds[0];

      try {
        await emailService.sendMenuChangeNotification({
          managerEmail: restaurant.manager_email,
          managerName: restaurant.manager_name || 'Manager',
          restaurantName: restaurant.name,
          restaurantSlug: restaurant.clarivore_slug || null,
          changes: analysis.changes,
          analysis,
          menuUrl: restaurant.menu_page_url,
          changeId: primaryChangeId
        });

        // Mark email as sent for all changes
        for (const changeId of changeIds) {
          await query(
            `UPDATE menu_changes SET email_sent = true, email_sent_at = NOW() WHERE id = $1`,
            [changeId]
          );
        }

        console.log(`[Monitoring] ✓ Changes detected and notification sent for ${restaurant.name}`);
      } catch (emailError) {
        console.error(`[Monitoring] Failed to send email:`, emailError);
      }

      // Update last_checked_at and last_change_detected_at
      await query(
        `UPDATE restaurants
         SET last_checked_at = NOW(), last_change_detected_at = NOW()
         WHERE id = $1`,
        [restaurantId]
      );

      res.json({
        success: true,
        hasChanges: true,
        changeIds,
        changes: analysis.changes,
        critical: hasCritical
      });
    } else {
      console.log(`[Monitoring] Menu analyzed but no changes detected for ${restaurant.name}`);

      // Update only last_checked_at (no changes detected)
      await query(
        `UPDATE restaurants
         SET last_checked_at = NOW()
         WHERE id = $1`,
        [restaurantId]
      );

      res.json({
        success: true,
        hasChanges: false,
        message: 'Menu analyzed but no significant changes detected'
      });
    }

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/monitoring/check-all
 * Trigger check for all active restaurants
 */
router.post('/check-all', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, name FROM restaurants WHERE active = true'
    );

    const restaurants = result.rows;
    const results = [];

    console.log(`[Monitoring] Checking ${restaurants.length} active restaurants...`);

    for (const restaurant of restaurants) {
      try {
        // Call the check endpoint for each restaurant
        const checkResult = await checkRestaurant(restaurant.id);
        results.push({
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          success: true,
          ...checkResult
        });
      } catch (error) {
        console.error(`[Monitoring] Error checking ${restaurant.name}:`, error.message);
        results.push({
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          success: false,
          error: error.message
        });
      }
    }

    const changesDetected = results.filter(r => r.hasChanges).length;

    res.json({
      success: true,
      totalChecked: restaurants.length,
      changesDetected,
      results
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/monitoring/jobs
 * Get monitoring job history
 */
router.get('/jobs', async (req, res, next) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await query(
      `SELECT * FROM monitoring_jobs
       ORDER BY started_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      success: true,
      count: result.rows.length,
      jobs: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/monitoring/jobs/:id
 * Get job details
 */
router.get('/jobs/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM monitoring_jobs WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      job: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Helper function to check a single restaurant
 * Used internally by check-all endpoint
 */
async function checkRestaurant(restaurantId) {
  const restaurantResult = await query(
    'SELECT * FROM restaurants WHERE id = $1',
    [restaurantId]
  );

  if (restaurantResult.rows.length === 0) {
    throw new Error('Restaurant not found');
  }

  const restaurant = restaurantResult.rows[0];
  const scrapedContent = await scraper.scrape(restaurant.menu_page_url);

  const previousResult = await query(
    `SELECT * FROM menu_snapshots
     WHERE restaurant_id = $1
     ORDER BY scraped_at DESC
     LIMIT 1`,
    [restaurantId]
  );

  const previousSnapshot = previousResult.rows[0];

  if (previousSnapshot && previousSnapshot.content_hash === scrapedContent.contentHash) {
    return { hasChanges: false };
  }

  const previousMenu = previousSnapshot ? previousSnapshot.menu_data : null;
  const analysis = await claudeService.analyzeMenu(scrapedContent, previousMenu);

  const snapshotResult = await query(
    `INSERT INTO menu_snapshots
     (restaurant_id, content_hash, menu_data, raw_content)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      restaurantId,
      scrapedContent.contentHash,
      JSON.stringify(analysis),
      scrapedContent.text
    ]
  );

  const snapshotId = snapshotResult.rows[0].id;

  if (analysis.hasChanges && analysis.changes) {
    const isCritical = claudeService.hasCriticalChanges(analysis.changes);

    const changeResult = await query(
      `INSERT INTO menu_changes
       (restaurant_id, snapshot_id, changes_detected, ai_suggestions, critical)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        restaurantId,
        snapshotId,
        JSON.stringify(analysis.changes),
        JSON.stringify(analysis.changes),
        isCritical
      ]
    );

    const changeId = changeResult.rows[0].id;

    try {
      await emailService.sendMenuChangeNotification({
        managerEmail: restaurant.manager_email,
        managerName: restaurant.manager_name || 'Manager',
        restaurantName: restaurant.name,
        changes: analysis.changes,
        analysis,
        menuUrl: restaurant.menu_url,
        changeId
      });

      await query(
        `INSERT INTO email_logs
         (restaurant_id, change_id, recipient, subject, sent_successfully)
         VALUES ($1, $2, $3, $4, true)`,
        [
          restaurantId,
          changeId,
          restaurant.manager_email,
          emailService.buildSubject(restaurant.name, analysis.changes)
        ]
      );
    } catch (emailError) {
      await query(
        `INSERT INTO email_logs
         (restaurant_id, change_id, recipient, error_message, sent_successfully)
         VALUES ($1, $2, $3, $4, false)`,
        [restaurantId, changeId, restaurant.manager_email, emailError.message]
      );
    }

    return {
      hasChanges: true,
      changeId,
      critical: isCritical
    };
  }

  return { hasChanges: false };
}

/**
 * GET /api/monitoring/snapshots/:restaurantId
 * Get all menu snapshots for a restaurant
 */
router.get('/snapshots/:restaurantId', async (req, res, next) => {
  try {
    const { restaurantId } = req.params;

    const result = await query(
      `SELECT id, restaurant_id, page_hash, menu_items, captured_at
       FROM menu_snapshots
       WHERE restaurant_id = $1
       ORDER BY captured_at DESC
       LIMIT 50`,
      [restaurantId]
    );

    res.json({
      success: true,
      snapshots: result.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
