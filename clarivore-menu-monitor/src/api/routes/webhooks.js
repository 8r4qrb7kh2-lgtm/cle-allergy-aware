const express = require('express');
const router = express.Router();
const { query } = require('../../database/db');
const crypto = require('crypto');

/**
 * Middleware to verify webhook signature
 */
function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-clarivore-signature'];
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) {
    // If no secret configured, skip verification (development mode)
    return next();
  }

  if (!signature) {
    return res.status(401).json({
      success: false,
      error: 'Missing webhook signature'
    });
  }

  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({
      success: false,
      error: 'Invalid webhook signature'
    });
  }

  next();
}

/**
 * POST /api/webhooks/clarivore/dish-updated
 * Webhook from Clarivore when a dish is updated in their system
 */
router.post('/clarivore/dish-updated', verifyWebhookSignature, async (req, res, next) => {
  try {
    const {
      changeId,
      restaurantId,
      dishName,
      action, // 'added', 'modified', 'removed'
      updatedBy,
      allergenData
    } = req.body;

    console.log(`[Webhook] Dish updated in Clarivore: ${dishName} (${action})`);

    // Mark the change as reviewed
    if (changeId) {
      await query(
        `UPDATE menu_changes
         SET
           reviewed = true,
           reviewed_at = NOW(),
           reviewed_by = $1,
           review_notes = $2
         WHERE id = $3`,
        [
          updatedBy || 'Clarivore System',
          `Dish ${action} in Clarivore system`,
          changeId
        ]
      );
    }

    // Log the webhook event
    await query(
      `INSERT INTO email_logs
       (restaurant_id, change_id, recipient, subject, sent_successfully, error_message)
       VALUES ($1, $2, $3, $4, true, $5)`,
      [
        restaurantId,
        changeId,
        'webhook',
        'Clarivore dish update notification',
        JSON.stringify({ action, dishName, updatedBy })
      ]
    );

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/webhooks/clarivore/review-completed
 * Webhook when manager completes reviewing all changes
 */
router.post('/clarivore/review-completed', verifyWebhookSignature, async (req, res, next) => {
  try {
    const { changeId, reviewedBy, notes } = req.body;

    console.log(`[Webhook] Review completed for change ${changeId}`);

    await query(
      `UPDATE menu_changes
       SET
         reviewed = true,
         reviewed_at = NOW(),
         reviewed_by = $1,
         review_notes = $2
       WHERE id = $3`,
      [reviewedBy, notes, changeId]
    );

    res.json({
      success: true,
      message: 'Review status updated'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/webhooks/test
 * Test webhook endpoint (no authentication required)
 */
router.post('/test', async (req, res) => {
  console.log('[Webhook] Test webhook received:', req.body);

  res.json({
    success: true,
    message: 'Test webhook received',
    receivedData: req.body,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
