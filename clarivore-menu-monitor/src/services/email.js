const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
require('dotenv').config();

/**
 * Email notification service
 */
class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
    this.templatesDir = path.join(__dirname, '../templates/emails');
    this.clarivoreEditorUrl = process.env.CLARIVORE_EDITOR_URL || 'https://clarivore.com/editor';
  }

  /**
   * Create email transporter based on configuration
   * @returns {Object} Nodemailer transporter
   */
  createTransporter() {
    const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';

    if (emailProvider === 'sendgrid') {
      // SendGrid SMTP configuration
      return nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY
        }
      });
    } else {
      // Generic SMTP configuration
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
    }
  }

  /**
   * Send menu change notification email
   * @param {Object} params - Email parameters
   * @param {string} params.managerEmail - Manager's email address
   * @param {string} params.managerName - Manager's name
   * @param {string} params.restaurantName - Restaurant name
   * @param {string} params.restaurantSlug - Restaurant slug for Clarivore URLs
   * @param {Object} params.changes - Detected changes from Claude
   * @param {Object} params.analysis - Full analysis result
   * @param {string} params.menuUrl - URL of the monitored menu
   * @param {string} params.changeId - Database ID of the change record
   * @returns {Promise<Object>} Email send result
   */
  async sendMenuChangeNotification(params) {
    const {
      managerEmail,
      managerName,
      restaurantName,
      restaurantSlug,
      changes,
      analysis,
      menuUrl,
      changeId
    } = params;

    try {
      console.log(`[Email] Preparing notification for ${managerEmail}...`);

      // Generate restaurant slug if not provided
      const slug = restaurantSlug || this.toSlug(restaurantName);

      // Build editor links for each change
      const editorLinks = this.buildEditorLinks(changes, changeId, slug);

      // Render HTML email
      const html = await this.renderTemplate('menu-change-notification.ejs', {
        managerName,
        restaurantName,
        changes,
        analysis,
        menuUrl,
        editorLinks,
        changeId,
        reviewUrl: `${this.clarivoreEditorUrl}/review/${changeId}`,
        hasCriticalChanges: this.hasCriticalChanges(changes)
      });

      // Render plain text version
      const text = this.generatePlainText(params, editorLinks);

      // Send email
      const result = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'Clarivore Menu Monitor <noreply@clarivore.com>',
        to: managerEmail,
        subject: this.buildSubject(restaurantName, changes),
        html,
        text
      });

      console.log(`[Email] ✓ Sent to ${managerEmail} (Message ID: ${result.messageId})`);

      return {
        success: true,
        messageId: result.messageId,
        recipient: managerEmail
      };

    } catch (error) {
      console.error('[Email] Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Build subject line based on changes
   * @param {string} restaurantName - Restaurant name
   * @param {Object} changes - Change details
   * @returns {string} Email subject
   */
  buildSubject(restaurantName, changes) {
    const totalChanges = (changes.added?.length || 0) +
                        (changes.removed?.length || 0) +
                        (changes.modified?.length || 0);

    const hasCritical = this.hasCriticalChanges(changes);
    const urgency = hasCritical ? '🚨 URGENT: ' : '';

    return `${urgency}${restaurantName} - ${totalChanges} Menu Change${totalChanges > 1 ? 's' : ''} Detected`;
  }

  /**
   * Check if changes include critical allergen updates
   * @param {Object} changes - Change details
   * @returns {boolean} True if critical changes found
   */
  hasCriticalChanges(changes) {
    // Check for allergen modifications
    if (changes.modified?.length > 0) {
      const hasAllergenChange = changes.modified.some(m =>
        m.field === 'allergens' || m.criticalChange === true
      );
      if (hasAllergenChange) return true;
    }

    // Check if new items have allergens
    if (changes.added?.length > 0) {
      const hasAllergensInNew = changes.added.some(item =>
        item.allergens && item.allergens.length > 0
      );
      if (hasAllergensInNew) return true;
    }

    return false;
  }

  /**
   * Convert text to URL-safe slug
   * @param {string} text - Text to convert
   * @returns {string} URL slug
   */
  toSlug(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Build editor links with pre-filled data
   * @param {Object} changes - Change details
   * @param {string} changeId - Change record ID
   * @param {string} restaurantSlug - Restaurant slug for Clarivore URL
   * @returns {Object} Editor links for each change type
   */
  buildEditorLinks(changes, changeId, restaurantSlug) {
    const links = {
      added: [],
      removed: [],
      modified: []
    };

    const baseUrl = 'https://clarivore.org/restaurant.html';

    // Links for added items
    if (changes.added?.length > 0) {
      changes.added.forEach((item, index) => {
        const dishSlug = this.toSlug(item.name);
        const params = new URLSearchParams({
          slug: restaurantSlug,
          dish: dishSlug,
          mode: 'manager'
        });

        links.added.push({
          item,
          url: `${baseUrl}?${params.toString()}`
        });
      });
    }

    // Links for modified items
    if (changes.modified?.length > 0) {
      changes.modified.forEach((change, index) => {
        const dishSlug = this.toSlug(change.name);
        const params = new URLSearchParams({
          slug: restaurantSlug,
          dish: dishSlug,
          mode: 'manager'
        });

        links.modified.push({
          change,
          url: `${baseUrl}?${params.toString()}`
        });
      });
    }

    // Links for removed items
    if (changes.removed?.length > 0) {
      changes.removed.forEach((item, index) => {
        const dishSlug = this.toSlug(item.name);
        const params = new URLSearchParams({
          slug: restaurantSlug,
          dish: dishSlug,
          mode: 'manager'
        });

        links.removed.push({
          item,
          url: `${baseUrl}?${params.toString()}`
        });
      });
    }

    return links;
  }

  /**
   * Render email template
   * @param {string} templateName - Template file name
   * @param {Object} data - Template data
   * @returns {Promise<string>} Rendered HTML
   */
  async renderTemplate(templateName, data) {
    const templatePath = path.join(this.templatesDir, templateName);
    return ejs.renderFile(templatePath, data);
  }

  /**
   * Generate plain text version of email
   * @param {Object} params - Email parameters
   * @param {Object} editorLinks - Pre-built editor links
   * @returns {string} Plain text email content
   */
  generatePlainText(params, editorLinks) {
    const { managerName, restaurantName, changes, menuUrl } = params;

    let text = `Hi ${managerName},\n\n`;
    text += `We detected changes to the menu at ${restaurantName}.\n\n`;
    text += `Menu URL: ${menuUrl}\n\n`;

    // Added items
    if (changes.added?.length > 0) {
      text += `NEW ITEMS ADDED (${changes.added.length}):\n`;
      changes.added.forEach((item, i) => {
        text += `\n${i + 1}. ${item.name}\n`;
        if (item.description) text += `   ${item.description}\n`;
        if (item.allergens?.length) text += `   Allergens: ${item.allergens.join(', ')}\n`;
        if (item.price) text += `   Price: ${item.price}\n`;
        text += `   Update in Clarivore: ${editorLinks.added[i].url}\n`;
      });
      text += '\n';
    }

    // Removed items
    if (changes.removed?.length > 0) {
      text += `ITEMS REMOVED (${changes.removed.length}):\n`;
      changes.removed.forEach((item, i) => {
        text += `\n${i + 1}. ${item.name}\n`;
        text += `   Remove from Clarivore: ${editorLinks.removed[i].url}\n`;
      });
      text += '\n';
    }

    // Modified items
    if (changes.modified?.length > 0) {
      text += `ITEMS MODIFIED (${changes.modified.length}):\n`;
      changes.modified.forEach((change, i) => {
        text += `\n${i + 1}. ${change.name}\n`;
        text += `   Field changed: ${change.field}\n`;
        text += `   Old: ${change.oldValue}\n`;
        text += `   New: ${change.newValue}\n`;
        if (change.criticalChange) text += `   ⚠️ CRITICAL ALLERGEN CHANGE\n`;
        text += `   Update in Clarivore: ${editorLinks.modified[i].url}\n`;
      });
      text += '\n';
    }

    text += `\n---\n`;
    text += `This is an automated notification from Clarivore Menu Monitor.\n`;
    text += `Please review and update your allergen information as needed.\n`;

    return text;
  }

  /**
   * Send test email
   * @param {string} recipientEmail - Test recipient
   * @returns {Promise<Object>} Send result
   */
  async sendTestEmail(recipientEmail) {
    const testChanges = {
      added: [
        {
          name: 'Mushroom Risotto',
          description: 'Creamy arborio rice with wild mushrooms, parmesan, and truffle oil',
          allergens: ['dairy', 'gluten'],
          dietaryFlags: ['vegetarian'],
          price: '$24.99',
          category: 'entree'
        }
      ],
      removed: [
        { name: 'Chicken Alfredo' }
      ],
      modified: [
        {
          name: 'Caesar Salad',
          field: 'allergens',
          oldValue: 'dairy, gluten',
          newValue: 'dairy, gluten, tree nuts',
          criticalChange: true
        }
      ]
    };

    return this.sendMenuChangeNotification({
      managerEmail: recipientEmail,
      managerName: 'Test Manager',
      restaurantName: 'Test Restaurant',
      changes: testChanges,
      analysis: { isMenuPage: true, menuItems: [], hasChanges: true, changes: testChanges },
      menuUrl: 'https://example.com/menu',
      changeId: 'test-123'
    });
  }
}

module.exports = new EmailService();
