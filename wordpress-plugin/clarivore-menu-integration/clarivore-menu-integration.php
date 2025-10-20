<?php
/**
 * Plugin Name: Clarivore Menu Integration
 * Plugin URI: https://clarivore.com
 * Description: Integrates allergen and dietary preference analysis directly into your WordPress menu editor. Automatically syncs menu items with Clarivore's database.
 * Version: 2.1.0
 * Author: Clarivore
 * Author URI: https://clarivore.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: clarivore-menu
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('CLARIVORE_VERSION', '2.1.0');
define('CLARIVORE_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('CLARIVORE_PLUGIN_URL', plugin_dir_url(__FILE__));

/**
 * Main Clarivore Menu Integration Class
 */
class Clarivore_Menu_Integration {

    private static $instance = null;

    /**
     * Get singleton instance
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        $this->init_hooks();
    }

    /**
     * Initialize WordPress hooks
     */
    private function init_hooks() {
        // Activation and deactivation hooks
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));

        // Admin menu and settings
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));

        // Enqueue admin scripts and styles
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));

        // Add custom post type support for menu items
        add_action('init', array($this, 'register_menu_item_post_type'));

        // Add meta boxes for allergen/dietary info
        add_action('add_meta_boxes', array($this, 'add_allergen_meta_boxes'));

        // Save meta box data
        add_action('save_post', array($this, 'save_menu_item_meta'), 10, 2);

        // Add AJAX handlers for AI analysis
        add_action('wp_ajax_clarivore_analyze_item', array($this, 'ajax_analyze_item'));
        add_action('wp_ajax_clarivore_ai_extract', array($this, 'ajax_ai_extract'));
        add_action('wp_ajax_clarivore_search_brands', array($this, 'ajax_search_brands'));
    }

    /**
     * Plugin activation
     */
    public function activate() {
        // Set default options
        if (!get_option('clarivore_restaurant_id')) {
            add_option('clarivore_restaurant_id', '');
        }
        if (!get_option('clarivore_auto_sync')) {
            add_option('clarivore_auto_sync', '1');
        }

        // Flush rewrite rules
        flush_rewrite_rules();
    }

    /**
     * Plugin deactivation
     */
    public function deactivate() {
        // Flush rewrite rules
        flush_rewrite_rules();
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_menu_page(
            'Clarivore Settings',
            'Clarivore',
            'manage_options',
            'clarivore-settings',
            array($this, 'render_settings_page'),
            'dashicons-food',
            30
        );
    }

    /**
     * Register plugin settings
     */
    public function register_settings() {
        register_setting('clarivore_settings', 'clarivore_restaurant_id');
        register_setting('clarivore_settings', 'clarivore_auto_sync');
        register_setting('clarivore_settings', 'clarivore_supabase_url');
        register_setting('clarivore_settings', 'clarivore_supabase_key');
    }

    /**
     * Render settings page
     */
    public function render_settings_page() {
        include CLARIVORE_PLUGIN_DIR . 'includes/admin-settings.php';
    }

    /**
     * Enqueue admin assets
     */
    public function enqueue_admin_assets($hook) {
        // Only load on post edit screens and settings page
        if (!in_array($hook, array('post.php', 'post-new.php', 'toplevel_page_clarivore-settings'))) {
            return;
        }

        wp_enqueue_style(
            'clarivore-admin-css',
            CLARIVORE_PLUGIN_URL . 'assets/css/admin.css',
            array(),
            CLARIVORE_VERSION
        );

        wp_enqueue_style(
            'clarivore-ai-assistant-css',
            CLARIVORE_PLUGIN_URL . 'assets/css/ai-assistant.css',
            array(),
            CLARIVORE_VERSION
        );

        wp_enqueue_script(
            'clarivore-admin-js',
            CLARIVORE_PLUGIN_URL . 'assets/js/admin.js',
            array('jquery'),
            CLARIVORE_VERSION,
            true
        );

        wp_enqueue_script(
            'clarivore-ai-assistant-js',
            CLARIVORE_PLUGIN_URL . 'assets/js/ai-assistant.js',
            array('jquery', 'clarivore-admin-js'),
            CLARIVORE_VERSION,
            true
        );

        // Pass data to JavaScript
        wp_localize_script('clarivore-admin-js', 'clarivoreData', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('clarivore_nonce'),
            'supabase_url' => get_option('clarivore_supabase_url', 'https://fgoiyycctnwnghrvsilt.supabase.co'),
            'supabase_key' => get_option('clarivore_supabase_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb2l5eWNjdG53bmdocnZzaWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MzY1MjYsImV4cCI6MjA3NjAxMjUyNn0.xlSSXr0Gl7j-vsckrj-2anpPmp4BG2SUIdN-_dquSA8'),
            'restaurant_id' => get_option('clarivore_restaurant_id', '')
        ));
    }

    /**
     * Register custom post type for menu items
     */
    public function register_menu_item_post_type() {
        $labels = array(
            'name' => 'Menu Items',
            'singular_name' => 'Menu Item',
            'menu_name' => 'Menu Items',
            'add_new' => 'Add New',
            'add_new_item' => 'Add New Menu Item',
            'edit_item' => 'Edit Menu Item',
            'new_item' => 'New Menu Item',
            'view_item' => 'View Menu Item',
            'search_items' => 'Search Menu Items',
            'not_found' => 'No menu items found',
            'not_found_in_trash' => 'No menu items found in trash'
        );

        $args = array(
            'labels' => $labels,
            'public' => true,
            'publicly_queryable' => true,
            'show_ui' => true,
            'show_in_menu' => true,
            'query_var' => true,
            'rewrite' => array('slug' => 'menu-item'),
            'capability_type' => 'post',
            'has_archive' => true,
            'hierarchical' => false,
            'menu_position' => 20,
            'menu_icon' => 'dashicons-food',
            'supports' => array('title', 'editor', 'thumbnail', 'excerpt'),
            'show_in_rest' => true
        );

        register_post_type('menu_item', $args);
    }

    /**
     * Add meta boxes for allergen and dietary information
     */
    public function add_allergen_meta_boxes() {
        add_meta_box(
            'clarivore_allergen_info',
            'Clarivore - Allergen & Dietary Information',
            array($this, 'render_allergen_meta_box'),
            array('menu_item', 'post'),
            'normal',
            'high'
        );
    }

    /**
     * Render allergen meta box
     */
    public function render_allergen_meta_box($post) {
        include CLARIVORE_PLUGIN_DIR . 'includes/meta-box.php';
    }

    /**
     * Save menu item meta data
     */
    public function save_menu_item_meta($post_id, $post) {
        // Verify nonce
        if (!isset($_POST['clarivore_nonce']) || !wp_verify_nonce($_POST['clarivore_nonce'], 'clarivore_save_meta')) {
            return;
        }

        // Check autosave
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }

        // Check permissions
        if (!current_user_can('edit_post', $post_id)) {
            return;
        }

        // Save allergen data
        if (isset($_POST['clarivore_allergens'])) {
            update_post_meta($post_id, '_clarivore_allergens', $_POST['clarivore_allergens']);
        } else {
            delete_post_meta($post_id, '_clarivore_allergens');
        }

        // Save dietary data
        if (isset($_POST['clarivore_diets'])) {
            update_post_meta($post_id, '_clarivore_diets', $_POST['clarivore_diets']);
        } else {
            delete_post_meta($post_id, '_clarivore_diets');
        }

        // Save removable items
        if (isset($_POST['clarivore_removable'])) {
            update_post_meta($post_id, '_clarivore_removable', sanitize_textarea_field($_POST['clarivore_removable']));
        }

        // Save cross-contamination info
        if (isset($_POST['clarivore_cross_contamination'])) {
            update_post_meta($post_id, '_clarivore_cross_contamination', $_POST['clarivore_cross_contamination']);
        } else {
            delete_post_meta($post_id, '_clarivore_cross_contamination');
        }

        // Auto-sync to Clarivore database if enabled
        if (get_option('clarivore_auto_sync', '1') === '1') {
            $this->sync_to_clarivore($post_id, $post);
        }
    }

    /**
     * Sync menu item to Clarivore database
     */
    private function sync_to_clarivore($post_id, $post) {
        $restaurant_id = get_option('clarivore_restaurant_id');
        if (empty($restaurant_id)) {
            return;
        }

        $supabase_url = get_option('clarivore_supabase_url', 'https://fgoiyycctnwnghrvsilt.supabase.co');
        $supabase_key = get_option('clarivore_supabase_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb2l5eWNjdG53bmdocnZzaWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MzY1MjYsImV4cCI6MjA3NjAxMjUyNn0.xlSSXr0Gl7j-vsckrj-2anpPmp4BG2SUIdN-_dquSA8');

        // Prepare menu item data
        $menu_item = array(
            'id' => $post->post_title,
            'allergens' => get_post_meta($post_id, '_clarivore_allergens', true) ?: array(),
            'diets' => get_post_meta($post_id, '_clarivore_diets', true) ?: array(),
            'removable' => array_filter(array_map('trim', explode(',', get_post_meta($post_id, '_clarivore_removable', true)))),
            'crossContamination' => get_post_meta($post_id, '_clarivore_cross_contamination', true) ?: array(),
            'details' => array()
        );

        // Get current overlays from restaurant
        $response = wp_remote_get(
            $supabase_url . '/rest/v1/restaurants?slug=eq.' . urlencode($restaurant_id),
            array(
                'headers' => array(
                    'apikey' => $supabase_key,
                    'Authorization' => 'Bearer ' . $supabase_key
                )
            )
        );

        if (is_wp_error($response)) {
            error_log('Clarivore sync error: ' . $response->get_error_message());
            return;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);
        if (empty($body[0])) {
            error_log('Clarivore sync error: Restaurant not found');
            return;
        }

        $restaurant = $body[0];
        $overlays = $restaurant['overlays'] ?: array();

        // Find and update or add the menu item in overlays
        $found = false;
        foreach ($overlays as &$overlay) {
            if ($overlay['id'] === $menu_item['id']) {
                $overlay = array_merge($overlay, $menu_item);
                $found = true;
                break;
            }
        }

        if (!$found) {
            // Add new overlay (without position data - that would be set in the main app)
            $menu_item['x'] = 0;
            $menu_item['y'] = 0;
            $menu_item['w'] = 20;
            $menu_item['h'] = 2;
            $overlays[] = $menu_item;
        }

        // Update restaurant with new overlays
        $update_response = wp_remote_request(
            $supabase_url . '/rest/v1/restaurants?slug=eq.' . urlencode($restaurant_id),
            array(
                'method' => 'PATCH',
                'headers' => array(
                    'apikey' => $supabase_key,
                    'Authorization' => 'Bearer ' . $supabase_key,
                    'Content-Type' => 'application/json',
                    'Prefer' => 'return=minimal'
                ),
                'body' => json_encode(array('overlays' => $overlays))
            )
        );

        if (is_wp_error($update_response)) {
            error_log('Clarivore sync error: ' . $update_response->get_error_message());
        }
    }

    /**
     * AJAX handler for AI analysis
     */
    public function ajax_analyze_item() {
        check_ajax_referer('clarivore_nonce', 'nonce');

        $description = sanitize_textarea_field($_POST['description']);
        $image_url = esc_url_raw($_POST['image_url']);

        $supabase_url = get_option('clarivore_supabase_url', 'https://fgoiyycctnwnghrvsilt.supabase.co');
        $supabase_key = get_option('clarivore_supabase_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb2l5eWNjdG53bmdocnZzaWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MzY1MjYsImV4cCI6MjA3NjAxMjUyNn0.xlSSXr0Gl7j-vsckrj-2anpPmp4BG2SUIdN-_dquSA8');

        // Get post title as dish name
        $post_id = intval($_POST['post_id'] ?? 0);
        $dish_name = '';
        if ($post_id > 0) {
            $post = get_post($post_id);
            if ($post) {
                $dish_name = $post->post_title;
            }
        }

        // Prepare request payload
        $payload = array(
            'text' => $description,
            'dishName' => $dish_name
        );

        // If image URL is provided, fetch and convert to base64
        if (!empty($image_url)) {
            $image_response = wp_remote_get($image_url);
            if (!is_wp_error($image_response)) {
                $image_data = wp_remote_retrieve_body($image_response);
                $image_type = wp_remote_retrieve_header($image_response, 'content-type');
                $base64_image = base64_encode($image_data);
                $payload['imageData'] = 'data:' . $image_type . ';base64,' . $base64_image;
            }
        }

        // Call Supabase Edge Function
        $response = wp_remote_post(
            $supabase_url . '/functions/v1/ai-ingredient-assistant',
            array(
                'headers' => array(
                    'Content-Type' => 'application/json',
                    'Authorization' => 'Bearer ' . $supabase_key,
                    'apikey' => $supabase_key
                ),
                'body' => json_encode($payload),
                'timeout' => 30
            )
        );

        if (is_wp_error($response)) {
            wp_send_json_error(array('message' => $response->get_error_message()));
            return;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        if (isset($body['error'])) {
            wp_send_json_error(array('message' => $body['error']));
            return;
        }

        // Transform AI response to plugin format
        $allergens = array();
        $diets = isset($body['dietaryOptions']) ? $body['dietaryOptions'] : array();
        $removable = array();

        // Extract allergens from ingredients
        if (isset($body['ingredients']) && is_array($body['ingredients'])) {
            foreach ($body['ingredients'] as $ingredient) {
                if (isset($ingredient['allergens']) && is_array($ingredient['allergens'])) {
                    foreach ($ingredient['allergens'] as $allergen) {
                        // Map allergen names to plugin format
                        $normalized = strtolower(str_replace(' ', '-', $allergen));

                        // Map variations to standard names
                        $allergen_map = array(
                            'tree-nut' => 'tree-nuts',
                            'treenut' => 'tree-nuts',
                            'tree-nuts' => 'tree-nuts',
                            'peanut' => 'peanuts',
                            'egg' => 'eggs'
                        );

                        $normalized = isset($allergen_map[$normalized]) ? $allergen_map[$normalized] : $normalized;

                        if (!in_array($normalized, $allergens)) {
                            $allergens[] = $normalized;
                        }
                    }
                }
            }
        }

        // Return formatted response
        wp_send_json_success(array(
            'allergens' => $allergens,
            'diets' => $diets,
            'removable' => $removable,
            'crossContamination' => array()
        ));
    }

    /**
     * AJAX handler for AI ingredient extraction (full workflow)
     */
    public function ajax_ai_extract() {
        check_ajax_referer('clarivore_nonce', 'nonce');

        $payload = json_decode(stripslashes($_POST['payload']), true);

        // Log payload info (but not the full image data)
        $payload_info = array(
            'has_imageData' => isset($payload['imageData']),
            'has_text' => isset($payload['text']),
            'dishName' => $payload['dishName'] ?? 'none'
        );
        if (isset($payload['imageData'])) {
            $payload_info['imageData_size'] = strlen($payload['imageData']);
        }
        error_log('AI Extract Payload Info: ' . json_encode($payload_info));

        $supabase_url = get_option('clarivore_supabase_url', 'https://fgoiyycctnwnghrvsilt.supabase.co');
        $supabase_key = get_option('clarivore_supabase_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb2l5eWNjdG53bmdocnZzaWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MzY1MjYsImV4cCI6MjA3NjAxMjUyNn0.xlSSXr0Gl7j-vsckrj-2anpPmp4BG2SUIdN-_dquSA8');

        // Call Supabase Edge Function with increased timeout for image processing
        $response = wp_remote_post(
            $supabase_url . '/functions/v1/ai-ingredient-assistant',
            array(
                'headers' => array(
                    'Content-Type' => 'application/json',
                    'Authorization' => 'Bearer ' . $supabase_key,
                    'apikey' => $supabase_key
                ),
                'body' => json_encode($payload),
                'timeout' => 60  // Increased from 30 to 60 seconds for image processing
            )
        );

        if (is_wp_error($response)) {
            wp_send_json_error(array('message' => $response->get_error_message()));
            return;
        }

        $response_code = wp_remote_retrieve_response_code($response);
        $raw_body = wp_remote_retrieve_body($response);

        // Log for debugging
        error_log('Supabase AI Response Code: ' . $response_code);
        error_log('Supabase AI Response Body: ' . substr($raw_body, 0, 500));

        if ($response_code !== 200) {
            wp_send_json_error(array(
                'message' => 'AI service returned error code: ' . $response_code,
                'details' => substr($raw_body, 0, 200)
            ));
            return;
        }

        $body = json_decode($raw_body, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            wp_send_json_error(array(
                'message' => 'Failed to parse AI response as JSON: ' . json_last_error_msg(),
                'raw' => substr($raw_body, 0, 200)
            ));
            return;
        }

        if (isset($body['error'])) {
            wp_send_json_error(array('message' => $body['error']));
            return;
        }

        wp_send_json_success($body);
    }

    /**
     * AJAX handler for brand search via Open Food Facts
     */
    public function ajax_search_brands() {
        check_ajax_referer('clarivore_nonce', 'nonce');

        $brand_filter = sanitize_text_field($_POST['query']);
        $ingredient_name = sanitize_text_field($_POST['ingredient'] ?? '');

        if (empty($ingredient_name)) {
            wp_send_json_error(array('message' => 'Ingredient name is required'));
            return;
        }

        // Construct search query: ingredient + brand (like restaurant.html does)
        $query = $brand_filter ? trim($ingredient_name . ' ' . $brand_filter) : $ingredient_name;

        error_log('Searching Open Food Facts - Ingredient: ' . $ingredient_name . ', Brand: ' . $brand_filter . ', Query: ' . $query);

        // Use the same API endpoint as restaurant.html (v1, not v2)
        $search_url = 'https://world.openfoodfacts.org/cgi/search.pl?' . http_build_query(array(
            'search_terms' => $query,
            'search_simple' => 1,
            'action' => 'process',
            'json' => 1,
            'page_size' => 12  // AI_BRAND_LIMIT * 2 for filtering
        ));

        $response = wp_remote_get($search_url, array(
            'timeout' => 30,
            'user-agent' => 'Clarivore Menu Integration/1.0'
        ));

        if (is_wp_error($response)) {
            error_log('Open Food Facts API error: ' . $response->get_error_message());
            wp_send_json_error(array('message' => 'Unable to connect to Open Food Facts. Please check your internet connection and try again.'));
            return;
        }

        $response_code = wp_remote_retrieve_response_code($response);
        error_log('Open Food Facts response code: ' . $response_code);

        if ($response_code !== 200) {
            error_log('Open Food Facts returned non-200 status: ' . $response_code);
            wp_send_json_error(array('message' => 'Open Food Facts service error. Please try again later.'));
            return;
        }

        $body = json_decode(wp_remote_retrieve_body($response), true);

        if (!isset($body['products']) || !is_array($body['products'])) {
            error_log('No products found in Open Food Facts response');
            wp_send_json_success(array('products' => array()));
            return;
        }

        error_log('Found ' . count($body['products']) . ' products from Open Food Facts');

        // Use AI to filter and rank products for English-only and relevance
        $supabase_url = get_option('clarivore_supabase_url', 'https://fgoiyycctnwnghrvsilt.supabase.co');
        $supabase_anon_key = get_option('clarivore_supabase_anon_key', '');

        error_log('Calling AI brand search function...');

        $ai_response = wp_remote_post($supabase_url . '/functions/v1/ai-brand-search', array(
            'timeout' => 45,
            'headers' => array(
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer ' . $supabase_anon_key,
                'apikey' => $supabase_anon_key
            ),
            'body' => json_encode(array(
                'products' => $body['products'],
                'ingredientName' => $ingredient_name,
                'brandQuery' => $brand_filter
            ))
        ));

        if (is_wp_error($ai_response)) {
            error_log('AI brand search error: ' . $ai_response->get_error_message());
            // Fall back to returning all products without filtering
            $filtered_products = array_slice($body['products'], 0, 6);
        } else {
            $ai_body = json_decode(wp_remote_retrieve_body($ai_response), true);

            if (isset($ai_body['filteredProducts'])) {
                $filtered_products = $ai_body['filteredProducts'];
                error_log('AI filtered to ' . count($filtered_products) . ' products');

                if (isset($ai_body['aiAnalysis'])) {
                    error_log('AI Analysis: ' . json_encode($ai_body['aiAnalysis']));
                }
            } else {
                error_log('No filteredProducts in AI response');
                $filtered_products = array_slice($body['products'], 0, 6);
            }
        }

        // Format products
        $products = array();

        foreach ($filtered_products as $product) {

            $allergens = array();

            // Extract allergens from allergens_tags
            if (isset($product['allergens_tags']) && is_array($product['allergens_tags'])) {
                foreach ($product['allergens_tags'] as $tag) {
                    // Remove 'en:' prefix
                    $allergen = str_replace('en:', '', $tag);
                    $allergen = str_replace('-', ' ', $allergen);
                    $allergens[] = $allergen;
                }
            }

            // Extract dietary preferences from labels_tags
            $diets = array();
            if (isset($product['labels_tags']) && is_array($product['labels_tags'])) {
                foreach ($product['labels_tags'] as $tag) {
                    $label = str_replace('en:', '', strtolower($tag));

                    if (strpos($label, 'vegan') !== false) {
                        $diets[] = 'Vegan';
                    } elseif (strpos($label, 'vegetarian') !== false) {
                        $diets[] = 'Vegetarian';
                    } elseif (strpos($label, 'pescatarian') !== false || strpos($label, 'pescetarian') !== false) {
                        $diets[] = 'Pescatarian';
                    } elseif (strpos($label, 'kosher') !== false) {
                        $diets[] = 'Kosher';
                    } elseif (strpos($label, 'halal') !== false) {
                        $diets[] = 'Halal';
                    }
                }
                // Remove duplicates
                $diets = array_unique($diets);
            }

            // Extract ingredients list
            $ingredientsList = array();
            if (isset($product['ingredients_text']) && !empty($product['ingredients_text'])) {
                $ingredients = explode(',', $product['ingredients_text']);
                $ingredientsList = array_map('trim', array_slice($ingredients, 0, 20));
            }

            // Build product URL (use provided URL or construct from code)
            $productUrl = '';
            if (!empty($product['url'])) {
                $productUrl = $product['url'];
            } elseif (!empty($product['code'])) {
                $productUrl = 'https://world.openfoodfacts.org/product/' . $product['code'];
            }

            $products[] = array(
                'name' => $product['product_name'],
                'brand' => $product['brands'],
                'image' => $product['image_url'] ?? '',
                'ingredientsImage' => $product['image_ingredients_url'] ?? '',
                'ingredientsList' => $ingredientsList,
                'allergens' => $allergens,
                'diets' => array_values($diets),  // Re-index array
                'url' => $productUrl
            );
        }

        wp_send_json_success(array('products' => $products));
    }
}

// Initialize the plugin
function clarivore_init() {
    return Clarivore_Menu_Integration::get_instance();
}
add_action('plugins_loaded', 'clarivore_init');
