<?php
/**
 * Admin Settings Page Template
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Save settings if form submitted
if (isset($_POST['clarivore_settings_submit'])) {
    check_admin_referer('clarivore_settings_nonce');

    update_option('clarivore_restaurant_id', sanitize_text_field($_POST['clarivore_restaurant_id']));
    update_option('clarivore_restaurant_slug', sanitize_text_field($_POST['clarivore_restaurant_slug']));
    update_option('clarivore_auto_sync', isset($_POST['clarivore_auto_sync']) ? '1' : '0');
    update_option('clarivore_supabase_url', esc_url_raw($_POST['clarivore_supabase_url']));
    update_option('clarivore_supabase_key', sanitize_text_field($_POST['clarivore_supabase_key']));

    echo '<div class="notice notice-success"><p>Settings saved successfully!</p></div>';
}

// Get current settings
$restaurant_id = get_option('clarivore_restaurant_id', '');
$restaurant_slug = get_option('clarivore_restaurant_slug', '');
$auto_sync = get_option('clarivore_auto_sync', '1');
$supabase_url = get_option('clarivore_supabase_url', 'https://fgoiyycctnwnghrvsilt.supabase.co');
$supabase_key = get_option('clarivore_supabase_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb2l5eWNjdG53bmdocnZzaWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MzY1MjYsImV4cCI6MjA3NjAxMjUyNn0.xlSSXr0Gl7j-vsckrj-2anpPmp4BG2SUIdN-_dquSA8');
?>

<div class="wrap">
    <h1>Clarivore Menu Integration Settings</h1>

    <div style="background: #fff; padding: 20px; margin-top: 20px; border: 1px solid #ccc; border-radius: 4px;">
        <h2>Getting Started</h2>
        <p>Welcome to Clarivore Menu Integration! This plugin allows you to manage allergen and dietary information directly from your WordPress menu editor.</p>

        <h3>How It Works:</h3>
        <ol>
            <li><strong>Configure your restaurant:</strong> Enter your restaurant slug/ID below (from your Clarivore account)</li>
            <li><strong>Create menu items:</strong> Go to Menu Items and add your dishes</li>
            <li><strong>Add allergen info:</strong> Use the AI-powered analysis or manually select allergens and dietary preferences</li>
            <li><strong>Auto-sync:</strong> Your menu items automatically sync to Clarivore's database</li>
        </ol>

        <p><strong>Note:</strong> Make sure your restaurant is already set up in the Clarivore system with a unique slug/ID.</p>
    </div>

    <form method="post" action="">
        <?php wp_nonce_field('clarivore_settings_nonce'); ?>

        <table class="form-table" style="margin-top: 20px;">
            <tr>
                <th scope="row">
                    <label for="clarivore_restaurant_slug">Restaurant Slug *</label>
                </th>
                <td>
                    <input type="text"
                           id="clarivore_restaurant_slug"
                           name="clarivore_restaurant_slug"
                           value="<?php echo esc_attr($restaurant_slug); ?>"
                           class="regular-text"
                           placeholder="mama-santas"
                           required />
                    <p class="description">
                        Your restaurant's URL slug from Clarivore (e.g., "mama-santas" from https://clarivore.org/restaurant.html?slug=<strong>mama-santas</strong>)
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="clarivore_restaurant_id">Restaurant ID (Optional)</label>
                </th>
                <td>
                    <input type="text"
                           id="clarivore_restaurant_id"
                           name="clarivore_restaurant_id"
                           value="<?php echo esc_attr($restaurant_id); ?>"
                           class="regular-text" />
                    <p class="description">Internal restaurant ID (if different from slug)</p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="clarivore_auto_sync">Auto-Sync</label>
                </th>
                <td>
                    <label>
                        <input type="checkbox"
                               id="clarivore_auto_sync"
                               name="clarivore_auto_sync"
                               value="1"
                               <?php checked($auto_sync, '1'); ?> />
                        Automatically sync menu items to Clarivore when saved
                    </label>
                    <p class="description">When enabled, menu items will automatically update in the Clarivore database</p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="clarivore_supabase_url">Supabase URL</label>
                </th>
                <td>
                    <input type="url"
                           id="clarivore_supabase_url"
                           name="clarivore_supabase_url"
                           value="<?php echo esc_attr($supabase_url); ?>"
                           class="regular-text" />
                    <p class="description">Leave as default unless you have a custom Clarivore installation</p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="clarivore_supabase_key">Supabase API Key</label>
                </th>
                <td>
                    <input type="text"
                           id="clarivore_supabase_key"
                           name="clarivore_supabase_key"
                           value="<?php echo esc_attr($supabase_key); ?>"
                           class="large-text" />
                    <p class="description">Leave as default unless you have a custom Clarivore installation</p>
                </td>
            </tr>
        </table>

        <p class="submit">
            <input type="submit"
                   name="clarivore_settings_submit"
                   id="submit"
                   class="button button-primary"
                   value="Save Settings" />
        </p>
    </form>

    <div style="background: #f0f0f1; padding: 20px; margin-top: 20px; border-left: 4px solid #2271b1;">
        <h3>Need Help?</h3>
        <p>Visit <a href="https://clarivore.com/docs" target="_blank">Clarivore Documentation</a> for detailed guides and tutorials.</p>
        <p>For support, contact us at <a href="mailto:support@clarivore.com">support@clarivore.com</a></p>
    </div>
</div>
