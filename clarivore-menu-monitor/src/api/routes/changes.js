const express = require('express');
const router = express.Router();
const { query } = require('../../database/db');

/**
 * GET /api/changes
 * List all menu changes
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      restaurantId,
      reviewed,
      critical,
      limit = 100,
      offset = 0
    } = req.query;

    let sql = `
      SELECT
        mc.*,
        r.name as restaurant_name,
        r.manager_email,
        ms.captured_at
      FROM menu_changes mc
      JOIN restaurants r ON mc.restaurant_id = r.id
      LEFT JOIN menu_snapshots ms ON mc.snapshot_id = ms.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (restaurantId) {
      sql += ` AND mc.restaurant_id = $${paramIndex++}`;
      params.push(restaurantId);
    }

    if (reviewed !== undefined) {
      sql += ` AND mc.reviewed = $${paramIndex++}`;
      params.push(reviewed === 'true');
    }

    if (critical !== undefined) {
      sql += ` AND mc.critical = $${paramIndex++}`;
      params.push(critical === 'true');
    }

    sql += ` ORDER BY mc.detected_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    res.json({
      success: true,
      count: result.rows.length,
      changes: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/changes/:id
 * Get change by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT
         mc.*,
         r.name as restaurant_name,
         r.menu_url,
         r.manager_email,
         r.manager_name,
         ms.menu_data as snapshot_data,
         ms.scraped_at
       FROM menu_changes mc
       JOIN restaurants r ON mc.restaurant_id = r.id
       LEFT JOIN menu_snapshots ms ON mc.snapshot_id = ms.id
       WHERE mc.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Change not found'
      });
    }

    res.json({
      success: true,
      change: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/changes/:id/review
 * Mark change as reviewed
 */
router.put('/:id/review', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reviewedBy, notes } = req.body;

    const result = await query(
      `UPDATE menu_changes
       SET
         reviewed = true,
         reviewed_at = NOW(),
         reviewed_by = $1,
         review_notes = $2
       WHERE id = $3
       RETURNING *`,
      [reviewedBy, notes, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Change not found'
      });
    }

    res.json({
      success: true,
      change: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/changes/stats/summary
 * Get summary statistics
 */
router.get('/stats/summary', async (req, res, next) => {
  try {
    const { restaurantId } = req.query;

    let whereClause = '';
    const params = [];

    if (restaurantId) {
      whereClause = 'WHERE restaurant_id = $1';
      params.push(restaurantId);
    }

    const result = await query(
      `SELECT
         COUNT(*) as total_changes,
         COUNT(*) FILTER (WHERE reviewed = false) as unreviewed_changes,
         COUNT(*) FILTER (WHERE critical = true) as critical_changes,
         COUNT(*) FILTER (WHERE critical = true AND reviewed = false) as unreviewed_critical,
         COUNT(DISTINCT restaurant_id) as affected_restaurants
       FROM menu_changes
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      stats: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/changes/recent/critical
 * Get recent critical unreviewed changes
 */
router.get('/recent/critical', async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;

    const result = await query(
      `SELECT
         mc.*,
         r.name as restaurant_name,
         r.manager_email,
         r.menu_url
       FROM menu_changes mc
       JOIN restaurants r ON mc.restaurant_id = r.id
       WHERE mc.critical = true AND mc.reviewed = false
       ORDER BY mc.detected_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      count: result.rows.length,
      changes: result.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
