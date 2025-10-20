/**
 * Clarivore Menu Integration - Admin JavaScript
 */

(function($) {
    'use strict';

    $(document).ready(function() {

        /**
         * Image Upload Handler
         */
        let mediaUploader;

        $('#clarivore-upload-image-btn').on('click', function(e) {
            e.preventDefault();

            // If the uploader object has already been created, reopen it
            if (mediaUploader) {
                mediaUploader.open();
                return;
            }

            // Create the media uploader
            mediaUploader = wp.media({
                title: 'Select Dish Image',
                button: {
                    text: 'Use this image'
                },
                multiple: false
            });

            // When an image is selected, run a callback
            mediaUploader.on('select', function() {
                const attachment = mediaUploader.state().get('selection').first().toJSON();
                $('#clarivore-ai-image-url').val(attachment.url);
                $('#clarivore-image-preview').html(
                    '<div style="position: relative; display: inline-block;">' +
                    '<img src="' + attachment.url + '" style="max-width: 150px; max-height: 100px; border-radius: 4px; border: 2px solid #ddd;" />' +
                    '<button type="button" class="button-link" id="clarivore-remove-image" style="position: absolute; top: -8px; right: -8px; background: #d63638; color: white; border-radius: 50%; width: 24px; height: 24px; border: 2px solid white; cursor: pointer; font-weight: bold;">&times;</button>' +
                    '</div>'
                );
            });

            mediaUploader.open();
        });

        // Remove image handler
        $(document).on('click', '#clarivore-remove-image', function(e) {
            e.preventDefault();
            $('#clarivore-ai-image-url').val('');
            $('#clarivore-image-preview').html('');
        });

        /**
         * AI Analysis Handler
         */
        $('#clarivore-analyze-btn').on('click', function(e) {
            e.preventDefault();

            const $btn = $(this);
            const $status = $('#clarivore-analysis-status');

            // Get description from Clarivore input field
            const description = $('#clarivore-ai-description').val();
            const imageUrl = $('#clarivore-ai-image-url').val();

            // Validate inputs
            if (!description || description.trim() === '') {
                $status.html('<p class="clarivore-analysis-error">❌ Please add a description of the dish before analyzing.</p>');
                $('#clarivore-ai-description').focus();
                return;
            }

            // Disable button and show loading
            $btn.prop('disabled', true).html('<span class="dashicons dashicons-update dashicons-spin" style="margin: 0; line-height: 1;"></span> <span>Analyzing...</span>');
            $status.html('<p class="clarivore-analysis-loading">🤖 Analyzing dish with AI...</p>');

            // Get post ID
            const postId = $('#post_ID').val() || 0;

            // Make AJAX request to analyze
            $.ajax({
                url: clarivoreData.ajax_url,
                type: 'POST',
                data: {
                    action: 'clarivore_analyze_item',
                    nonce: clarivoreData.nonce,
                    post_id: postId,
                    description: description,
                    image_url: imageUrl
                },
                success: function(response) {
                    if (response.success && response.data) {
                        const results = applyAnalysisResults(response.data);
                        $status.html(
                            '<p class="clarivore-analysis-success">✅ Analysis complete!</p>' +
                            '<div style="background: #d4edda; border-left: 4px solid #28a745; padding: 10px; margin-top: 10px; border-radius: 3px;">' +
                            '<strong>Detected:</strong><br>' +
                            (results.allergenCount > 0 ? '• ' + results.allergenCount + ' allergen(s)<br>' : '') +
                            (results.dietCount > 0 ? '• ' + results.dietCount + ' dietary preference(s)<br>' : '') +
                            (results.removableCount > 0 ? '• ' + results.removableCount + ' removable ingredient(s)<br>' : '') +
                            '<small style="color: #666; margin-top: 5px; display: block;">Review the results below and adjust as needed.</small>' +
                            '</div>'
                        );
                    } else {
                        $status.html('<p class="clarivore-analysis-error">❌ Analysis failed: ' + (response.data?.message || 'Unknown error') + '</p>');
                    }
                },
                error: function(xhr, status, error) {
                    $status.html('<p class="clarivore-analysis-error">Error: ' + error + '</p>');
                },
                complete: function() {
                    $btn.prop('disabled', false).html('<span class="dashicons dashicons-analytics" style="margin: 0; line-height: 1;"></span> <span>Analyze with AI</span>');
                }
            });
        });

        /**
         * Apply AI analysis results to form
         */
        function applyAnalysisResults(data) {
            // Clear all checkboxes first
            $('input[name="clarivore_allergens[]"]').prop('checked', false);
            $('input[name="clarivore_diets[]"]').prop('checked', false);
            $('input[name="clarivore_cross_contamination[]"]').prop('checked', false);

            let allergenCount = 0;
            let dietCount = 0;
            let removableCount = 0;
            let crossContCount = 0;

            // Apply allergens
            if (data.allergens && Array.isArray(data.allergens)) {
                data.allergens.forEach(function(allergen) {
                    $('input[name="clarivore_allergens[]"][value="' + allergen + '"]').prop('checked', true);
                    allergenCount++;
                });
            }

            // Apply diets
            if (data.diets && Array.isArray(data.diets)) {
                data.diets.forEach(function(diet) {
                    $('input[name="clarivore_diets[]"][value="' + diet + '"]').prop('checked', true);
                    dietCount++;
                });
            }

            // Apply removable ingredients
            if (data.removable && Array.isArray(data.removable)) {
                $('textarea[name="clarivore_removable"]').val(data.removable.join(', '));
                removableCount = data.removable.length;
            }

            // Apply cross-contamination
            if (data.crossContamination && Array.isArray(data.crossContamination)) {
                data.crossContamination.forEach(function(allergen) {
                    $('input[name="clarivore_cross_contamination[]"][value="' + allergen + '"]').prop('checked', true);
                    crossContCount++;
                });
            }

            // Highlight the changes
            $('.clarivore-section').css('background-color', '#fffbcc');
            setTimeout(function() {
                $('.clarivore-section').css('background-color', '');
            }, 2000);

            // Return counts for status message
            return {
                allergenCount: allergenCount,
                dietCount: dietCount,
                removableCount: removableCount,
                crossContCount: crossContCount
            };
        }

        /**
         * Auto-save warning for allergen changes
         */
        let hasUnsavedChanges = false;

        $('input[name="clarivore_allergens[]"], input[name="clarivore_diets[]"], textarea[name="clarivore_removable"], input[name="clarivore_cross_contamination[]"]').on('change', function() {
            hasUnsavedChanges = true;
        });

        // Reset flag when post is saved
        $(document).on('heartbeat-tick', function() {
            hasUnsavedChanges = false;
        });

        // Warn before leaving with unsaved changes
        $(window).on('beforeunload', function() {
            if (hasUnsavedChanges) {
                return 'You have unsaved allergen information. Are you sure you want to leave?';
            }
        });

        /**
         * Real-time validation
         */
        function validateAllergenSelection() {
            const selectedAllergens = $('input[name="clarivore_allergens[]"]:checked').length;
            const selectedDiets = $('input[name="clarivore_diets[]"]:checked').length;

            // Check for conflicting selections
            const hasEggs = $('input[name="clarivore_allergens[]"][value="eggs"]').is(':checked');
            const hasDairy = $('input[name="clarivore_allergens[]"][value="dairy"]').is(':checked');
            const isVegan = $('input[name="clarivore_diets[]"][value="Vegan"]').is(':checked');

            if (isVegan && (hasEggs || hasDairy)) {
                showValidationWarning('A vegan dish cannot contain eggs or dairy.');
            } else {
                hideValidationWarning();
            }
        }

        function showValidationWarning(message) {
            let $warning = $('#clarivore-validation-warning');
            if (!$warning.length) {
                $warning = $('<div id="clarivore-validation-warning" style="background: #fcf8e3; border-left: 4px solid #f0ad4e; padding: 10px; margin: 10px 0;"></div>');
                $('.clarivore-meta-box').prepend($warning);
            }
            $warning.html('<strong>Warning:</strong> ' + message);
        }

        function hideValidationWarning() {
            $('#clarivore-validation-warning').remove();
        }

        // Run validation on checkbox change
        $('input[name="clarivore_allergens[]"], input[name="clarivore_diets[]"]').on('change', validateAllergenSelection);

        /**
         * Checkbox UI enhancements
         */
        $('input[type="checkbox"]').each(function() {
            const $checkbox = $(this);
            const $label = $checkbox.closest('label');

            $label.on('click', function() {
                setTimeout(function() {
                    if ($checkbox.is(':checked')) {
                        $label.css('font-weight', '600');
                    } else {
                        $label.css('font-weight', 'normal');
                    }
                }, 10);
            });

            // Initialize styling
            if ($checkbox.is(':checked')) {
                $label.css('font-weight', '600');
            }
        });

    });

})(jQuery);
