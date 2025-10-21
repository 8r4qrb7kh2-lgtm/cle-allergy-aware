const express = require('express');
const router = express.Router();
const { query } = require('../../database/db');

/**
 * GET /api/restaurants
 * List all restaurants
 */
router.get('/', async (req, res, next) => {
  try {
    const { active } = req.query;

    let sql = 'SELECT * FROM restaurants';
    const params = [];

    if (active !== undefined) {
      sql += ' WHERE active = $1';
      params.push(active === 'true');
    }

    sql += ' ORDER BY name ASC';

    const result = await query(sql, params);

    res.json({
      success: true,
      count: result.rows.length,
      restaurants: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/restaurants/:id
 * Get restaurant by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM restaurants WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Restaurant not found'
      });
    }

    res.json({
      success: true,
      restaurant: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/restaurants
 * Create new restaurant
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      websiteUrl,
      menuPageUrl,
      managerEmail,
      managerName,
      checkFrequency = 'daily',
      isActive = true
    } = req.body;

    // Validation
    if (!name || !menuPageUrl || !managerEmail) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, menuPageUrl, managerEmail'
      });
    }

    const result = await query(
      `INSERT INTO restaurants
       (name, website_url, menu_page_url, manager_email, manager_name, check_frequency, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, websiteUrl || menuPageUrl, menuPageUrl, managerEmail, managerName, checkFrequency, isActive]
    );

    res.status(201).json({
      success: true,
      restaurant: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/restaurants/:id
 * Update restaurant
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      menuUrl,
      managerEmail,
      managerName,
      checkFrequency,
      active
    } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (menuUrl !== undefined) {
      updates.push(`menu_url = $${paramIndex++}`);
      params.push(menuUrl);
    }
    if (managerEmail !== undefined) {
      updates.push(`manager_email = $${paramIndex++}`);
      params.push(managerEmail);
    }
    if (managerName !== undefined) {
      updates.push(`manager_name = $${paramIndex++}`);
      params.push(managerName);
    }
    if (checkFrequency !== undefined) {
      updates.push(`check_frequency = $${paramIndex++}`);
      params.push(checkFrequency);
    }
    if (active !== undefined) {
      updates.push(`active = $${paramIndex++}`);
      params.push(active);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE restaurants SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Restaurant not found'
      });
    }

    res.json({
      success: true,
      restaurant: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/restaurants/:id
 * Delete restaurant
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM restaurants WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Restaurant not found'
      });
    }

    res.json({
      success: true,
      message: 'Restaurant deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/restaurants/:id/history
 * Get menu change history for a restaurant
 */
router.get('/:id/history', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await query(
      `SELECT
         mc.*,
         ms.scraped_at,
         ms.content_hash
       FROM menu_changes mc
       LEFT JOIN menu_snapshots ms ON mc.snapshot_id = ms.id
       WHERE mc.restaurant_id = $1
       ORDER BY mc.detected_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
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

/**
 * GET /api/restaurants/:id/latest-snapshot
 * Get latest menu snapshot for a restaurant
 */
router.get('/:id/latest-snapshot', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT * FROM menu_snapshots
       WHERE restaurant_id = $1
       ORDER BY scraped_at DESC
       LIMIT 1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        snapshot: null,
        message: 'No snapshots found'
      });
    }

    res.json({
      success: true,
      snapshot: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
