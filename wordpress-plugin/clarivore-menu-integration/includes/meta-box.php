<?php
/**
 * Allergen and Dietary Meta Box Template - Simplified
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Get the post title for the dish name
$dish_name = get_the_title($post->ID);
$restaurant_slug = get_option('clarivore_restaurant_slug', ''); // Get from settings

// Nonce field
wp_nonce_field('clarivore_save_meta', 'clarivore_nonce');
?>

<div class="clarivore-meta-box">
    <!-- Link to Main Website -->
    <div class="clarivore-section" style="background: #f8f9fa; padding: 20px; border-radius: 4px; text-align: center;">
        <h3 style="margin-top: 0; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <span class="dashicons dashicons-food" style="color: #2271b1;"></span>
            Ingredient Analysis
        </h3>
        <p style="margin: 15px 0;">Add ingredients, search brands, and verify allergens with product labels.</p>

        <?php if (empty($restaurant_slug)): ?>
            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 15px; margin-bottom: 15px;">
                <p style="margin: 0; color: #856404;">
                    <strong>⚠️ Configuration Required:</strong> Please configure your restaurant slug in the
                    <a href="<?php echo admin_url('admin.php?page=clarivore-settings'); ?>">Clarivore Settings</a> page first.
                </p>
            </div>
            <button type="button" class="button button-primary button-hero" disabled
                    style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; font-size: 14px; opacity: 0.5; cursor: not-allowed;">
                <span class="dashicons dashicons-external" style="margin: 0; line-height: 1;"></span>
                <span>Add Ingredients</span>
            </button>
        <?php else: ?>
            <a href="https://clarivore.org/restaurant.html?slug=<?php echo urlencode($restaurant_slug); ?>&edit=1&dishId=<?php echo urlencode($post->ID); ?>&dishName=<?php echo urlencode($dish_name); ?>&openAI=true"
               target="_blank"
               class="button button-primary button-hero"
               id="clarivore-add-ingredients"
               style="display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; font-size: 14px; text-decoration: none;">
                <span class="dashicons dashicons-external" style="margin: 0; line-height: 1;"></span>
                <span>Add Ingredients</span>
            </a>
        <?php endif; ?>

        <p style="margin-top: 15px; color: #646970; font-size: 13px;">
            Opens the Clarivore ingredient editor in a new tab
        </p>
    </div>

    <!-- Saved Allergen Information Display (Read-Only) -->
    <?php
    $allergens = get_post_meta($post->ID, '_clarivore_allergens', true) ?: array();
    $diets = get_post_meta($post->ID, '_clarivore_diets', true) ?: array();
    $removable = get_post_meta($post->ID, '_clarivore_removable', true) ?: '';
    ?>

    <?php if (!empty($allergens) || !empty($diets) || !empty($removable)): ?>
    <div class="clarivore-section" style="margin-top: 20px; background: #fff; padding: 15px; border: 1px solid #ddd; border-radius: 4px;">
        <h4 style="margin-top: 0;">Current Allergen & Dietary Information</h4>
        <p style="color: #646970; font-size: 13px; margin-bottom: 15px;">
            This information is synced from Clarivore. To update, use the "Add Ingredients" button above.
        </p>

        <?php if (!empty($allergens)): ?>
        <div style="margin-bottom: 15px;">
            <strong style="display: block; margin-bottom: 5px;">
                <span class="dashicons dashicons-warning" style="color: #d63638; font-size: 16px;"></span>
                Allergens:
            </strong>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                <?php foreach ($allergens as $allergen): ?>
                <span style="background: #f7d4d4; color: #8a2424; padding: 4px 10px; border-radius: 3px; font-size: 12px;">
                    <?php echo esc_html(ucwords(str_replace('-', ' ', $allergen))); ?>
                </span>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>

        <?php if (!empty($diets)): ?>
        <div style="margin-bottom: 15px;">
            <strong style="display: block; margin-bottom: 5px;">
                <span class="dashicons dashicons-yes" style="color: #00a32a; font-size: 16px;"></span>
                Dietary Preferences:
            </strong>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                <?php foreach ($diets as $diet): ?>
                <span style="background: #e6f4ea; color: #1e8e3e; padding: 4px 10px; border-radius: 3px; font-size: 12px;">
                    <?php echo esc_html($diet); ?>
                </span>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>

        <?php if (!empty($removable)): ?>
        <div>
            <strong style="display: block; margin-bottom: 5px;">Removable Ingredients:</strong>
            <p style="margin: 0; color: #646970;"><?php echo esc_html($removable); ?></p>
        </div>
        <?php endif; ?>
    </div>
    <?php endif; ?>
</div>

<!-- Unsaved Changes Detection -->
<script>
jQuery(document).ready(function($) {
    // Track initial values
    var initialTitle = $('#title').val();
    var initialContent = $('#content').val();
    var hasUnsavedChanges = false;

    // Monitor changes to title and content
    $('#title, #content').on('change keyup', function() {
        var currentTitle = $('#title').val();
        var currentContent = $('#content').val();

        hasUnsavedChanges = (currentTitle !== initialTitle) || (currentContent !== initialContent);
    });

    // Intercept page unload
    $(window).on('beforeunload', function(e) {
        if (hasUnsavedChanges) {
            var message = 'You have unsaved changes to the dish name or description. Would you like to update the allergen information on Clarivore before leaving?';

            // Modern browsers don't show custom messages anymore, but we still need to return a value
            e.preventDefault();
            e.returnValue = message;
            return message;
        }
    });

    // When user clicks Save/Publish, reset the flag
    $('#publish, #save-post').on('click', function() {
        // Small delay to let the save happen
        setTimeout(function() {
            initialTitle = $('#title').val();
            initialContent = $('#content').val();
            hasUnsavedChanges = false;
        }, 100);
    });

    // Custom prompt when clicking "Add Ingredients" button with unsaved changes
    $('#clarivore-add-ingredients').on('click', function(e) {
        if (hasUnsavedChanges) {
            var confirmed = confirm(
                'You have unsaved changes to the dish name or description.\n\n' +
                'Please save your changes first, then update the allergen information on Clarivore.\n\n' +
                'Would you like to save now and continue to Clarivore?'
            );

            if (confirmed) {
                e.preventDefault();

                // Save the post
                $('#publish, #save-post').click();

                // Wait for save, then open Clarivore
                var checkSaved = setInterval(function() {
                    if (!$('#publish').hasClass('disabled') && !$('#save-post').hasClass('disabled')) {
                        clearInterval(checkSaved);
                        window.open(e.currentTarget.href, '_blank');
                    }
                }, 500);

                setTimeout(function() {
                    clearInterval(checkSaved);
                }, 5000); // Timeout after 5 seconds
            } else {
                e.preventDefault();
            }
        }
    });
});
</script>
