/**
 * Clarivore AI Ingredient Assistant
 * Full workflow implementation for WordPress
 */

(function($) {
    'use strict';

    // State management
    const aiAssistState = {
        photos: [],
        ingredients: [],
        brandSuggestions: {},
        brandMemory: {}
    };

    $(document).ready(function() {

        // Load brand memory from WordPress options
        loadBrandMemory();

        /**
         * Open AI Assistant Modal
         */
        $('#clarivore-open-ai-assistant').on('click', function() {
            $('#clarivore-ai-modal').fadeIn(200);
            $('#clarivore-ai-input').focus();
        });

        /**
         * Close AI Assistant Modal
         */
        $('#clarivore-ai-close').on('click', closeAiAssistant);
        $('.clarivore-ai-backdrop').on('click', function(e) {
            if ($(e.target).hasClass('clarivore-ai-backdrop')) {
                closeAiAssistant();
            }
        });

        function closeAiAssistant() {
            $('#clarivore-ai-modal').fadeOut(200);
            // Reset state
            $('#clarivore-ai-input').val('');
            $('#clarivore-ai-photos-preview').empty();
            $('#clarivore-ai-results').hide();
            $('#clarivore-ai-status').empty().removeClass('info success error warning');
            aiAssistState.photos = [];
            aiAssistState.ingredients = [];
        }

        /**
         * Photo Upload
         */
        let mediaUploader;

        $('#clarivore-ai-upload-photos').on('click', function(e) {
            e.preventDefault();

            if (mediaUploader) {
                mediaUploader.open();
                return;
            }

            mediaUploader = wp.media({
                title: 'Select Recipe Photos',
                button: { text: 'Use these photos' },
                multiple: true
            });

            mediaUploader.on('select', function() {
                const selection = mediaUploader.state().get('selection');

                selection.each(function(attachment) {
                    const attachmentJSON = attachment.toJSON();
                    addPhoto(attachmentJSON.url, attachmentJSON.id);
                });
            });

            mediaUploader.open();
        });

        function addPhoto(url, id) {
            aiAssistState.photos.push({ url, id });
            renderPhotosPreview();
        }

        function removePhoto(index) {
            aiAssistState.photos.splice(index, 1);
            renderPhotosPreview();
        }

        function renderPhotosPreview() {
            const $preview = $('#clarivore-ai-photos-preview');
            $preview.empty();

            aiAssistState.photos.forEach((photo, index) => {
                const $photoDiv = $(`
                    <div class="clarivore-photo-preview">
                        <img src="${photo.url}" alt="Recipe photo ${index + 1}" />
                        <button type="button" class="clarivore-photo-remove" data-index="${index}">&times;</button>
                    </div>
                `);
                $preview.append($photoDiv);
            });

            // Attach remove handlers
            $('.clarivore-photo-remove').on('click', function() {
                const index = $(this).data('index');
                removePhoto(index);
            });
        }

        /**
         * Dictation Support
         */
        $('#clarivore-ai-dictate').on('click', function() {
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                showStatus('Speech recognition is not supported in your browser.', 'error');
                return;
            }

            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();

            recognition.lang = 'en-US';
            recognition.continuous = false;
            recognition.interimResults = false;

            $(this).prop('disabled', true).html('<span class="dashicons dashicons-microphone"></span> Listening...');

            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript;
                const $input = $('#clarivore-ai-input');
                const currentText = $input.val();
                $input.val(currentText ? currentText + ' ' + transcript : transcript);
            };

            recognition.onerror = function(event) {
                showStatus('Speech recognition error: ' + event.error, 'error');
            };

            recognition.onend = function() {
                $('#clarivore-ai-dictate').prop('disabled', false).html('<span class="dashicons dashicons-microphone"></span> Dictate');
            };

            recognition.start();
        });

        /**
         * Process Input
         */
        $('#clarivore-ai-process').on('click', handleAiProcess);

        async function handleAiProcess() {
            const text = $('#clarivore-ai-input').val().trim();
            const hasPhotos = aiAssistState.photos.length > 0;

            if (!text && !hasPhotos) {
                showStatus('Please provide either a description or upload recipe photos.', 'warning');
                return;
            }

            showStatus('Processing with AI...', 'info');
            $('#clarivore-ai-process').prop('disabled', true);

            try {
                const postId = $('#post_ID').val() || 0;
                const dishName = $('#title').val() || '';

                let allIngredients = [];

                // Process photos if available
                if (hasPhotos) {
                    showStatus('Processing photos...', 'info');

                    let compressedImage;
                    try {
                        // Compress the first image before sending (AI function handles one image at a time)
                        compressedImage = await compressImage(aiAssistState.photos[0].url);

                        // Log image size for debugging
                        const imageSizeKB = Math.round(compressedImage.length / 1024);
                        console.log('Compressed image size:', imageSizeKB + 'KB');

                        // Check if image is too large (Claude API limit is ~5MB for base64)
                        if (imageSizeKB > 4000) {
                            showStatus('Image is too large (' + imageSizeKB + 'KB). Please try a smaller image or describe ingredients in text.', 'warning');
                            $('#clarivore-ai-process').prop('disabled', false);
                            return;
                        }
                    } catch (compressionError) {
                        console.error('Image compression failed:', compressionError);
                        showStatus('Failed to process image: ' + compressionError.message + '. Please describe ingredients in text instead.', 'error');
                        $('#clarivore-ai-process').prop('disabled', false);
                        return;
                    }

                    const payload = {
                        imageData: compressedImage,
                        text: text || '',
                        dishName: dishName
                    };

                    console.log('Sending payload to AI service...');
                    const result = await requestAiExtraction(payload);
                    if (result && result.ingredients) {
                        allIngredients = result.ingredients;
                        if (result.dietaryOptions) {
                            aiAssistState.dietaryOptions = result.dietaryOptions;
                        }
                    }
                }
                // Process text only if no photos
                else if (text) {
                    const payload = {
                        text: text,
                        dishName: dishName
                    };

                    const result = await requestAiExtraction(payload);
                    if (result && result.ingredients) {
                        allIngredients = result.ingredients;
                        if (result.dietaryOptions) {
                            aiAssistState.dietaryOptions = result.dietaryOptions;
                        }
                    }
                }

                if (allIngredients.length === 0) {
                    showStatus('No ingredients found. Please try again with more details.', 'warning');
                    return;
                }

                aiAssistState.ingredients = allIngredients;
                renderIngredientsTable();
                showStatus(`Successfully extracted ${allIngredients.length} ingredient(s)!`, 'success');
                $('#clarivore-ai-results').fadeIn();

            } catch (error) {
                console.error('AI processing error:', error);
                let errorMsg = 'Error processing ingredients: ' + error.message;

                // Show more details if available
                if (error.responseJSON && error.responseJSON.data) {
                    if (error.responseJSON.data.raw) {
                        errorMsg += '<br><small>Response: ' + escapeHtml(error.responseJSON.data.raw) + '</small>';
                    }
                    if (error.responseJSON.data.details) {
                        errorMsg += '<br><small>' + escapeHtml(error.responseJSON.data.details) + '</small>';
                    }
                }

                showStatus(errorMsg, 'error');
            } finally {
                $('#clarivore-ai-process').prop('disabled', false);
            }
        }

        /**
         * Request AI Extraction
         */
        async function requestAiExtraction(payload) {
            const response = await $.ajax({
                url: clarivoreData.ajax_url,
                type: 'POST',
                data: {
                    action: 'clarivore_ai_extract',
                    nonce: clarivoreData.nonce,
                    payload: JSON.stringify(payload)
                }
            });

            if (!response.success) {
                throw new Error(response.data?.message || 'AI extraction failed');
            }

            return response.data;
        }

        /**
         * Fetch Image as Base64
         */
        async function fetchImageAsBase64(url) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.onload = function() {
                    const reader = new FileReader();
                    reader.onloadend = function() {
                        resolve(reader.result);
                    };
                    reader.readAsDataURL(xhr.response);
                };
                xhr.onerror = reject;
                xhr.open('GET', url);
                xhr.responseType = 'blob';
                xhr.send();
            });
        }

        /**
         * Merge Ingredients (avoid duplicates)
         */
        function mergeIngredients(existing, newItems, dietaryOptions) {
            const merged = [...existing];
            const existingNames = existing.map(i => normalizeIngredientName(i.name));

            newItems.forEach(item => {
                const normalized = normalizeIngredientName(item.name);
                if (!existingNames.includes(normalized)) {
                    merged.push(item);
                    existingNames.push(normalized);
                }
            });

            return merged;
        }

        function normalizeIngredientName(name) {
            return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        }

        /**
         * Render Ingredients Table
         */
        function renderIngredientsTable() {
            const $tbody = $('#clarivore-ai-table-body');
            $tbody.empty();

            aiAssistState.ingredients.forEach((ingredient, index) => {
                const rememberedBrand = getRememberedBrand(ingredient.name);
                const brands = rememberedBrand ? [rememberedBrand] : [];

                const $row = createIngredientRow(ingredient, index, brands);
                $tbody.append($row);
            });
        }

        /**
         * Determine if removable checkbox should be enabled
         * Enable if ingredient has allergens OR doesn't fulfill all dietary preferences
         */
        function shouldEnableRemovable(allergens, diets) {
            // Enable if has any allergens
            if (allergens && allergens.length > 0) {
                return true;
            }

            // Enable if missing any dietary preferences (i.e., not all 3 preferences are met)
            const allDietaryPreferences = ['Vegan', 'Vegetarian', 'Pescatarian'];
            const missingPreferences = allDietaryPreferences.some(pref => !diets.includes(pref));

            return missingPreferences;
        }

        function createIngredientRow(ingredient, index, brands = []) {
            const allergens = ingredient.allergens || [];
            const diets = aiAssistState.dietaryOptions || [];

            const $row = $(`
                <tr data-index="${index}">
                    <td>
                        <input type="text"
                               class="clarivore-ingredient-name"
                               value="${escapeHtml(ingredient.name)}"
                               data-index="${index}" />
                    </td>
                    <td class="clarivore-brand-cell">
                        <div class="clarivore-brands-list" data-index="${index}">
                            ${renderBrandsList(brands, index)}
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 8px;">
                            <button type="button" class="clarivore-scan-barcode" data-index="${index}">
                                <span class="dashicons dashicons-smartphone" style="font-size: 16px; width: 16px; height: 16px;"></span>
                                <span>Scan Brand Barcode</span>
                            </button>
                            <button type="button" class="clarivore-add-brand" data-index="${index}">
                                <span>Search Brands</span>
                            </button>
                        </div>
                    </td>
                    <td>
                        <div class="clarivore-allergen-checklist">
                            ${renderAllergenCheckboxes(allergens, index)}
                        </div>
                    </td>
                    <td>
                        <div class="clarivore-diet-checklist">
                            ${renderDietCheckboxes(diets, index)}
                        </div>
                    </td>
                    <td class="clarivore-removable-checkbox">
                        <input type="checkbox"
                               class="clarivore-removable-check"
                               data-index="${index}"
                               ${shouldEnableRemovable(allergens, diets) ? '' : 'disabled'}
                               title="${shouldEnableRemovable(allergens, diets) ? 'Mark as removable' : 'No allergens or missing dietary preferences'}" />
                    </td>
                    <td class="clarivore-substitutable-cell">
                        <input type="checkbox"
                               class="clarivore-substitutable-check"
                               data-index="${index}"
                               title="Mark as substitutable" />
                        <div class="clarivore-substitute-section" data-index="${index}" style="display: none; margin-top: 8px;">
                            <input type="text"
                                   class="clarivore-substitute-name"
                                   placeholder="Substitute ingredient name"
                                   data-index="${index}"
                                   style="width: 100%; margin-bottom: 6px;" />
                            <div style="display: flex; gap: 6px;">
                                <button type="button" class="clarivore-substitute-scan-barcode" data-index="${index}" style="font-size: 11px; padding: 3px 6px;">
                                    <span class="dashicons dashicons-smartphone" style="font-size: 14px; width: 14px; height: 14px;"></span>
                                    <span>Scan Barcode</span>
                                </button>
                                <button type="button" class="clarivore-substitute-search-brands" data-index="${index}" style="font-size: 11px; padding: 3px 6px;">
                                    <span>Search Brands</span>
                                </button>
                            </div>
                        </div>
                    </td>
                    <td class="clarivore-confirm-checkbox">
                        <input type="checkbox"
                               class="clarivore-confirm-check"
                               data-index="${index}"
                               ${brands.length > 0 ? 'checked' : ''} />
                    </td>
                </tr>
            `);

            return $row;
        }

        function renderBrandsList(brands, ingredientIndex) {
            if (brands.length === 0) {
                return '<p style="color: #646970; font-size: 12px; margin: 0;">No brands added yet</p>';
            }

            return brands.map((brand, brandIndex) => `
                <div class="clarivore-brand-item" data-brand-index="${brandIndex}">
                    <div class="clarivore-brand-item-header">
                        <strong>${escapeHtml(brand.name || brand.brand)}</strong>
                        <button type="button" class="clarivore-brand-remove" data-ingredient="${ingredientIndex}" data-brand="${brandIndex}">&times;</button>
                    </div>
                    ${brand.brandImage || brand.ingredientsImage ? `
                        <div class="clarivore-brand-preview">
                            ${brand.brandImage ? `<img src="${brand.brandImage}" onclick="openImageModal('${brand.brandImage}')" title="Click to enlarge" />` : ''}
                            ${brand.ingredientsImage ? `<img src="${brand.ingredientsImage}" onclick="openImageModal('${brand.ingredientsImage}')" title="Ingredient label - click to enlarge" />` : ''}
                        </div>
                    ` : ''}
                    ${brand.ingredientsList && brand.ingredientsList.length > 0 ? `
                        <div class="clarivore-ingredient-list">
                            <small>Ingredients: ${brand.ingredientsList.join(', ')}</small>
                        </div>
                    ` : ''}
                </div>
            `).join('');
        }

        function renderAllergenCheckboxes(allergens, index) {
            const allergenList = ['dairy', 'eggs', 'fish', 'shellfish', 'tree-nuts', 'peanuts', 'wheat', 'gluten', 'soy', 'sesame'];

            return allergenList.map(allergen => `
                <label>
                    <input type="checkbox"
                           value="${allergen}"
                           data-index="${index}"
                           ${allergens.includes(allergen) ? 'checked' : ''} />
                    <span>${capitalize(allergen.replace('-', ' '))}</span>
                </label>
            `).join('');
        }

        function renderDietCheckboxes(diets, index) {
            const dietList = ['Vegan', 'Vegetarian', 'Pescatarian'];

            return dietList.map(diet => `
                <label>
                    <input type="checkbox"
                           value="${diet}"
                           data-index="${index}"
                           ${diets.includes(diet) ? 'checked' : ''} />
                    <span>${diet}</span>
                </label>
            `).join('');
        }

        /**
         * Add Brand - Open Search Modal
         */
        $(document).on('click', '.clarivore-add-brand', function() {
            const index = $(this).data('index');
            const ingredientName = $(`.clarivore-ingredient-name[data-index="${index}"]`).val();
            openBrandSearch(ingredientName, index);
        });

        /**
         * Scan Barcode Handler (from table)
         */
        $(document).on('click', '.clarivore-scan-barcode', function() {
            const index = $(this).data('index');
            const ingredientName = $(`.clarivore-ingredient-name[data-index="${index}"]`).val();

            const barcode = prompt('Enter the barcode number from the product:');
            if (barcode && barcode.trim()) {
                // Open the brand search modal with the barcode
                openBrandSearch(ingredientName, index);
                // Wait for modal to open, then trigger search
                setTimeout(function() {
                    $('#clarivore-brand-search-query').val(barcode.trim());
                    performBrandSearch(barcode.trim(), index);
                }, 100);
            }
        });

        /**
         * Update removable checkbox state when allergens or dietary preferences change
         */
        $(document).on('change', '.clarivore-allergen-checklist input, .clarivore-diet-checklist input', function() {
            const $row = $(this).closest('tr');
            const index = $row.data('index');

            // Collect current allergens and diets for this row
            const allergens = [];
            $row.find('.clarivore-allergen-checklist input:checked').each(function() {
                allergens.push($(this).val());
            });

            const diets = [];
            $row.find('.clarivore-diet-checklist input:checked').each(function() {
                diets.push($(this).val());
            });

            // Update removable checkbox state
            const $removableCheckbox = $(`.clarivore-removable-check[data-index="${index}"]`);
            const shouldEnable = shouldEnableRemovable(allergens, diets);

            if (shouldEnable) {
                $removableCheckbox.prop('disabled', false);
                $removableCheckbox.attr('title', 'Mark as removable');
            } else {
                $removableCheckbox.prop('disabled', true);
                $removableCheckbox.prop('checked', false); // Uncheck if disabling
                $removableCheckbox.attr('title', 'No allergens or missing dietary preferences');
            }
        });

        /**
         * Toggle substitute section when substitutable checkbox is checked
         */
        $(document).on('change', '.clarivore-substitutable-check', function() {
            const index = $(this).data('index');
            const $substituteSection = $(`.clarivore-substitute-section[data-index="${index}"]`);

            if ($(this).is(':checked')) {
                $substituteSection.slideDown(200);
            } else {
                $substituteSection.slideUp(200);
                // Clear substitute name when unchecked
                $(`.clarivore-substitute-name[data-index="${index}"]`).val('');
            }
        });

        /**
         * Substitute Scan Barcode Handler
         */
        $(document).on('click', '.clarivore-substitute-scan-barcode', function() {
            const index = $(this).data('index');
            const substituteName = $(`.clarivore-substitute-name[data-index="${index}"]`).val().trim();

            if (!substituteName) {
                alert('Please enter a substitute ingredient name first.');
                return;
            }

            const barcode = prompt('Enter the barcode number from the substitute product:');
            if (barcode && barcode.trim()) {
                openBrandSearch(substituteName, index, true); // true = is substitute
                setTimeout(function() {
                    $('#clarivore-brand-search-query').val(barcode.trim());
                    performBrandSearch(barcode.trim(), index);
                }, 100);
            }
        });

        /**
         * Substitute Search Brands Handler
         */
        $(document).on('click', '.clarivore-substitute-search-brands', function() {
            const index = $(this).data('index');
            const substituteName = $(`.clarivore-substitute-name[data-index="${index}"]`).val().trim();

            if (!substituteName) {
                alert('Please enter a substitute ingredient name first.');
                return;
            }

            openBrandSearch(substituteName, index, true); // true = is substitute
        });

        /**
         * Open Brand Search Modal
         */
        async function openBrandSearch(ingredientName, ingredientIndex) {
            $('#clarivore-brand-modal').fadeIn(200);

            const $content = $('#clarivore-brand-content');
            $content.html(`
                <div class="clarivore-brand-search-form">
                    <label style="display: block; font-weight: 600; margin-bottom: 10px;">
                        Ingredient: <strong>${escapeHtml(ingredientName)}</strong>
                    </label>
                    <input type="text"
                           class="clarivore-brand-search-input"
                           id="clarivore-brand-search-query"
                           placeholder="Enter brand name or barcode"
                           value="" />
                    <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                        <button type="button" class="button button-primary clarivore-icon-btn" id="clarivore-brand-search-submit">
                            <span class="dashicons dashicons-search"></span>
                            <span>Search</span>
                        </button>
                        <button type="button" class="button" id="clarivore-brand-search-cancel">Cancel</button>
                    </div>
                    <div id="clarivore-brand-search-results" style="margin-top: 20px;">
                        <p style="color: #646970; text-align: center; padding: 20px;">Enter a brand name or scan a barcode to find products.</p>
                    </div>
                </div>
            `);

            // Store current ingredient info
            $('#clarivore-brand-modal').data('ingredient-name', ingredientName);
            $('#clarivore-brand-modal').data('ingredient-index', ingredientIndex);

            // Don't auto-search anymore - wait for user to type and click Search

            // Search button handler
            $('#clarivore-brand-search-submit').on('click', function() {
                const query = $('#clarivore-brand-search-query').val().trim();

                if (!query) {
                    $('#clarivore-brand-search-results').html('<p style="color: #d63638; text-align: center; padding: 20px;">Please enter a brand name to search.</p>');
                    return;
                }

                // Get the CURRENT ingredient name from the input field (in case it was changed)
                const currentIngredientName = $(`.clarivore-ingredient-name[data-index="${ingredientIndex}"]`).val().trim();

                // Combine brand name with ingredient for more accurate results
                const searchTerm = query + ' ' + currentIngredientName;
                performBrandSearch(searchTerm, ingredientIndex);
            });

            // Cancel button
            $('#clarivore-brand-search-cancel, .clarivore-brand-close').on('click', function() {
                $('#clarivore-brand-modal').fadeOut(200);
            });

            // Allow Enter key to search
            $('#clarivore-brand-search-query').on('keypress', function(e) {
                if (e.which === 13) {
                    $('#clarivore-brand-search-submit').click();
                }
            });
        }

        /**
         * Perform Brand Search via Open Food Facts
         */
        async function performBrandSearch(query, ingredientIndex) {
            const $results = $('#clarivore-brand-search-results');
            $results.html('<p style="text-align:center;"><span class="clarivore-spinner"></span> Searching...</p>');

            try {
                // Get the CURRENT ingredient name from the input field (in case it was changed)
                const ingredientName = $(`.clarivore-ingredient-name[data-index="${ingredientIndex}"]`).val().trim();
                const suggestions = await fetchBrandSuggestions(query, ingredientName);

                if (suggestions.length === 0) {
                    $results.html('<p style="color: #646970;">No products found. Try a different search term or brand name.</p>');
                    return;
                }

                // Store suggestions
                aiAssistState.brandSuggestions[ingredientIndex] = suggestions;

                // Sort suggestions: items with ingredient label images first
                const sortedSuggestions = suggestions.sort((a, b) => {
                    const aHasImage = !!(a.ingredientsImage && a.ingredientsImage.length > 0) ? 1 : 0;
                    const bHasImage = !!(b.ingredientsImage && b.ingredientsImage.length > 0) ? 1 : 0;
                    return bHasImage - aHasImage; // Items with images first
                });

                // Render results
                $results.html('<div class="clarivore-brand-results"></div>');
                const $resultsDiv = $results.find('.clarivore-brand-results');

                sortedSuggestions.forEach((suggestion, suggestionIndex) => {
                    const $suggestion = createBrandSuggestion(suggestion, ingredientIndex, suggestionIndex);
                    $resultsDiv.append($suggestion);
                });

            } catch (error) {
                console.error('Brand search error:', error);
                $results.html('<p style="color: #d63638;">Error searching for brands. Please try again.</p>');
            }
        }

        /**
         * Fetch Brand Suggestions from Open Food Facts
         */
        async function fetchBrandSuggestions(query, ingredientName) {
            const response = await $.ajax({
                url: clarivoreData.ajax_url,
                type: 'POST',
                data: {
                    action: 'clarivore_search_brands',
                    nonce: clarivoreData.nonce,
                    query: query,
                    ingredient: ingredientName  // Send ingredient name for better filtering
                }
            });

            if (!response.success) {
                throw new Error(response.data?.message || 'Brand search failed');
            }

            return response.data.products || [];
        }

        /**
         * Create Brand Suggestion Element
         */
        function createBrandSuggestion(suggestion, ingredientIndex, suggestionIndex) {
            // Top 9 allergens only
            const top9Allergens = ['milk', 'eggs', 'egg', 'fish', 'shellfish', 'tree nuts', 'tree nut', 'peanuts', 'peanut', 'wheat', 'soy'];

            // Filter to only top 9 allergens and normalize names
            const filteredAllergens = (suggestion.allergens || [])
                .map(a => a.toLowerCase())
                .filter(a => top9Allergens.some(t => a.includes(t.replace('s', '')) || t.includes(a.replace('s', ''))))
                .map(a => {
                    // Normalize names
                    if (a.includes('egg')) return 'Eggs';
                    if (a.includes('milk') || a.includes('dairy')) return 'Milk';
                    if (a.includes('peanut')) return 'Peanuts';
                    if (a.includes('tree') || a.includes('nut')) return 'Tree Nuts';
                    if (a.includes('wheat')) return 'Wheat';
                    if (a.includes('soy')) return 'Soy';
                    if (a.includes('fish')) return 'Fish';
                    if (a.includes('shellfish')) return 'Shellfish';
                    return capitalize(a);
                })
                .filter((v, i, arr) => arr.indexOf(v) === i); // Remove duplicates

            const allergenBadges = filteredAllergens.length > 0
                ? filteredAllergens.map(a => `<span class="clarivore-brand-allergen-badge">${escapeHtml(a)}</span>`).join('')
                : '<span style="color: #646970; font-size: 11px;">None detected</span>';

            // Format dietary options (capitalize properly)
            const dietBadges = suggestion.diets && suggestion.diets.length > 0
                ? suggestion.diets.map(d => `<span class="clarivore-brand-diet-badge" style="background: #edfaef; color: #00a32a; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 500; display: inline-block; margin-right: 4px;">${escapeHtml(capitalize(d))}</span>`).join('')
                : '<span style="color: #646970; font-size: 11px;">None detected</span>';

            // Check if has ingredient label image
            const hasIngredientImage = !!(suggestion.ingredientsImage && suggestion.ingredientsImage.length > 0);

            const $suggestion = $(`
                <div class="clarivore-brand-suggestion" data-ingredient="${ingredientIndex}" data-suggestion="${suggestionIndex}" data-has-image="${hasIngredientImage ? '1' : '0'}">
                    ${suggestion.image ? `
                        <div class="clarivore-brand-suggestion-img">
                            <img src="${suggestion.image}" alt="${escapeHtml(suggestion.name)}" />
                        </div>
                    ` : ''}
                    <div class="clarivore-brand-suggestion-info">
                        <h4>${escapeHtml(suggestion.name)}</h4>
                        <p><strong>Brand:</strong> ${escapeHtml(suggestion.brand || 'Unknown')}</p>

                        ${suggestion.url ? `
                            <p style="font-size: 11px; margin: 5px 0;">
                                <a href="${escapeHtml(suggestion.url)}" target="_blank" rel="noopener noreferrer" style="color: #2271b1; text-decoration: none;">
                                    <span class="dashicons dashicons-external" style="font-size: 13px; vertical-align: middle;"></span>
                                    View on Open Food Facts
                                </a>
                            </p>
                        ` : ''}

                        ${hasIngredientImage ? `
                            <p style="font-size: 11px; color: #00a32a; margin: 5px 0;">
                                <span class="dashicons dashicons-yes-alt" style="font-size: 13px; vertical-align: middle;"></span>
                                <strong>Ingredient label image available</strong>
                            </p>
                        ` : `
                            <p style="font-size: 11px; color: #d63638; margin: 5px 0;">
                                <span class="dashicons dashicons-warning" style="font-size: 13px; vertical-align: middle;"></span>
                                No ingredient label image
                            </p>
                        `}

                        ${suggestion.ingredientsList && suggestion.ingredientsList.length > 0 ? `
                            <p style="font-size: 11px; color: #646970; margin: 5px 0;">
                                <strong>Ingredients:</strong> ${suggestion.ingredientsList.slice(0, 5).join(', ')}${suggestion.ingredientsList.length > 5 ? '...' : ''}
                            </p>
                        ` : ''}

                        <div style="margin-top: 8px;">
                            <div class="clarivore-brand-allergens" style="margin-bottom: 6px;">
                                <strong style="font-size: 11px; color: #d63638; display: inline-block; margin-right: 8px; vertical-align: top;">Top 9 Allergens:</strong>
                                <div style="display: inline-block; vertical-align: top;">${allergenBadges}</div>
                            </div>
                            <div class="clarivore-brand-diets" style="margin-top: 6px;">
                                <strong style="font-size: 11px; color: #00a32a; display: inline-block; margin-right: 8px; vertical-align: top;">Dietary Preferences:</strong>
                                <div style="display: inline-block; vertical-align: top;">${dietBadges}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `);

            // Click to select
            $suggestion.on('click', function(e) {
                // Don't trigger selection if clicking a link
                if ($(e.target).closest('a').length > 0) {
                    return;
                }

                const ingIdx = $(this).data('ingredient');
                const sugIdx = $(this).data('suggestion');
                selectBrandSuggestion(ingIdx, sugIdx);
            });

            return $suggestion;
        }

        /**
         * Select Brand Suggestion - Show Verification Modal
         */
        function selectBrandSuggestion(ingredientIndex, suggestionIndex) {
            const suggestion = aiAssistState.brandSuggestions[ingredientIndex][suggestionIndex];
            showVerificationModal(suggestion, ingredientIndex);
        }

        /**
         * Show Verification Modal
         */
        function showVerificationModal(product, ingredientIndex) {
            $('#clarivore-verify-modal').fadeIn(200);

            const $content = $('#clarivore-verify-content');

            const hasImage = !!(product.ingredientsImage || product.image);

            $content.html(`
                <h3 class="clarivore-verify-product-name">${escapeHtml(product.name)}</h3>
                <p style="color: #646970; margin-bottom: 15px;">
                    <strong>Brand:</strong> ${escapeHtml(product.brand || 'Unknown')}
                </p>

                ${hasImage ? `
                    <div class="clarivore-verify-images">
                        ${product.image ? `
                            <div class="clarivore-verify-image">
                                <img src="${product.image}" alt="Product image" onclick="openImageModal('${product.image}')" />
                                <p>Product Image</p>
                            </div>
                        ` : ''}
                        ${product.ingredientsImage ? `
                            <div class="clarivore-verify-image">
                                <img src="${product.ingredientsImage}" alt="Ingredient label" onclick="openImageModal('${product.ingredientsImage}')" />
                                <p>Ingredient Label - Click to enlarge</p>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}

                ${product.ingredientsList && product.ingredientsList.length > 0 ? `
                    <div class="clarivore-verify-ingredients">
                        <h4>Ingredients List (from database):</h4>
                        <div class="clarivore-verify-ingredients-list">
                            ${product.ingredientsList.join(', ')}
                        </div>
                    </div>
                ` : ''}

                ${(() => {
                    // Filter to top 9 allergens only
                    const top9Allergens = ['milk', 'eggs', 'egg', 'fish', 'shellfish', 'tree nuts', 'tree nut', 'peanuts', 'peanut', 'wheat', 'soy'];
                    const filteredAllergens = (product.allergens || [])
                        .map(a => a.toLowerCase())
                        .filter(a => top9Allergens.some(t => a.includes(t.replace('s', '')) || t.includes(a.replace('s', ''))))
                        .map(a => {
                            if (a.includes('egg')) return 'Eggs';
                            if (a.includes('milk') || a.includes('dairy')) return 'Milk';
                            if (a.includes('peanut')) return 'Peanuts';
                            if (a.includes('tree') || a.includes('nut')) return 'Tree Nuts';
                            if (a.includes('wheat')) return 'Wheat';
                            if (a.includes('soy')) return 'Soy';
                            if (a.includes('fish')) return 'Fish';
                            if (a.includes('shellfish')) return 'Shellfish';
                            return capitalize(a);
                        })
                        .filter((v, i, arr) => arr.indexOf(v) === i);

                    return filteredAllergens.length > 0 ? `
                        <div class="clarivore-verify-allergens">
                            <h4>⚠️ Top 9 Allergens Detected:</h4>
                            <p>${filteredAllergens.map(a => escapeHtml(a)).join(', ')}</p>
                        </div>
                    ` : '';
                })()}

                ${product.diets && product.diets.length > 0 ? `
                    <div class="clarivore-verify-dietary" style="background: #edfaef; padding: 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #00a32a;">
                        <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #00a32a;">✓ Detected Dietary Preferences:</h4>
                        <p style="margin: 0;">${product.diets.map(d => escapeHtml(d)).join(', ')}</p>
                    </div>
                ` : ''}

                <div class="clarivore-verify-warning">
                    <strong>⚠️ Safety Warning</strong>
                    <p>Data is crowdsourced and may be outdated or incorrect. ALWAYS verify ingredient labels match the actual product image before relying on allergen information.</p>
                </div>

                ${hasImage ? `
                    <div class="clarivore-verify-checkbox">
                        <label>
                            <input type="checkbox" id="clarivore-verify-confirm-check" />
                            <span>The ingredient label image is readable and matches this exact product</span>
                        </label>
                    </div>
                ` : `
                    <div class="clarivore-verify-warning" style="background: #fcf0f1; border-color: #d63638;">
                        <strong>⚠️ No ingredient label image available</strong>
                        <p>Using this product without verification is not recommended.</p>
                    </div>
                `}

                <div class="clarivore-verify-actions">
                    <button type="button" class="button" id="clarivore-verify-cancel">Cancel</button>
                    <button type="button"
                            class="button button-primary"
                            id="clarivore-verify-confirm"
                            ${hasImage ? 'disabled style="opacity: 0.5;"' : ''}>
                        ${hasImage ? 'Confirm & Apply' : 'Use Anyway (Not Recommended)'}
                    </button>
                </div>
            `);

            // Store current selection
            $('#clarivore-verify-modal').data('product', product);
            $('#clarivore-verify-modal').data('ingredient-index', ingredientIndex);

            // Enable confirm button when checkbox is checked
            if (hasImage) {
                $('#clarivore-verify-confirm-check').on('change', function() {
                    $('#clarivore-verify-confirm')
                        .prop('disabled', !this.checked)
                        .css('opacity', this.checked ? '1' : '0.5');
                });
            }

            // Cancel button
            $('#clarivore-verify-cancel, .clarivore-verify-close').on('click', function() {
                $('#clarivore-verify-modal').fadeOut(200);
            });

            // Confirm button
            $('#clarivore-verify-confirm').on('click', function() {
                const product = $('#clarivore-verify-modal').data('product');
                const ingredientIndex = $('#clarivore-verify-modal').data('ingredient-index');
                applyBrandToIngredient(product, ingredientIndex);
                $('#clarivore-verify-modal').fadeOut(200);
                $('#clarivore-brand-modal').fadeOut(200);
            });
        }

        /**
         * Apply Brand to Ingredient
         */
        function applyBrandToIngredient(product, ingredientIndex) {
            const ingredient = aiAssistState.ingredients[ingredientIndex];

            // Initialize brands array if needed
            if (!ingredient.brands) {
                ingredient.brands = [];
            }

            // Add brand
            ingredient.brands.push({
                name: product.name,
                brand: product.brand,
                brandImage: product.image,
                ingredientsImage: product.ingredientsImage,
                ingredientsList: product.ingredientsList || [],
                allergens: product.allergens || []
            });

            // Update allergens based on brand
            if (product.allergens && product.allergens.length > 0) {
                const currentAllergens = ingredient.allergens || [];
                product.allergens.forEach(allergen => {
                    if (!currentAllergens.includes(allergen)) {
                        currentAllergens.push(allergen);
                    }
                });
                ingredient.allergens = currentAllergens;
            }

            // Remember this brand for future use
            rememberBrand(ingredient.name, product);

            // Re-render the ingredient table
            renderIngredientsTable();

            // Auto-check confirmed
            $(`.clarivore-confirm-check[data-index="${ingredientIndex}"]`).prop('checked', true);
        }

        /**
         * Remove Brand
         */
        $(document).on('click', '.clarivore-brand-remove', function() {
            const ingredientIndex = $(this).data('ingredient');
            const brandIndex = $(this).data('brand');

            const ingredient = aiAssistState.ingredients[ingredientIndex];
            if (ingredient.brands && ingredient.brands[brandIndex]) {
                ingredient.brands.splice(brandIndex, 1);
                renderIngredientsTable();
            }
        });

        /**
         * Confirm All Ingredients
         */
        $('#clarivore-ai-confirm-all').on('click', function() {
            const unconfirmed = [];

            $('.clarivore-confirm-check').each(function(index) {
                if (!$(this).is(':checked')) {
                    const name = $(`.clarivore-ingredient-name[data-index="${index}"]`).val();
                    if (name.trim()) {
                        unconfirmed.push(name);
                    }
                }
            });

            if (unconfirmed.length > 0) {
                alert(`⚠️ Please confirm allergens for all ingredients first.\n\nUnconfirmed ingredients:\n${unconfirmed.join('\n')}\n\nCheck the "Confirmed" checkbox for each ingredient.`);
                return;
            }

            $('#clarivore-ai-final-confirmation').fadeIn();
            $('#clarivore-ai-final-confirmation')[0].scrollIntoView({ behavior: 'smooth' });
        });

        /**
         * Save to Dish - Final Application
         */
        $('#clarivore-ai-apply').on('click', function() {
            const ingredientsData = collectIngredientsData();

            // Verify all are confirmed
            const unconfirmed = ingredientsData.filter(item => item.name.trim() && !item.confirmed);
            if (unconfirmed.length > 0) {
                alert('Cannot save - not all ingredients are confirmed. Please confirm all ingredients first.');
                return;
            }

            // Apply to WordPress post meta
            applyToPostMeta(ingredientsData);

            // Close modal
            closeAiAssistant();

            showStatus('Ingredients successfully saved!', 'success');
        });

        /**
         * Collect Ingredients Data from Table
         */
        function collectIngredientsData() {
            const data = [];

            $('#clarivore-ai-table-body tr').each(function() {
                const $row = $(this);
                const index = $row.data('index');

                const name = $(`.clarivore-ingredient-name[data-index="${index}"]`).val().trim();
                const allergens = [];
                const diets = [];

                $row.find('.clarivore-allergen-checklist input:checked').each(function() {
                    allergens.push($(this).val());
                });

                $row.find('.clarivore-diet-checklist input:checked').each(function() {
                    diets.push($(this).val());
                });

                const removable = $(`.clarivore-removable-check[data-index="${index}"]`).is(':checked');
                const confirmed = $(`.clarivore-confirm-check[data-index="${index}"]`).is(':checked');

                const ingredient = aiAssistState.ingredients[index];

                data.push({
                    name,
                    allergens,
                    diets,
                    brands: ingredient.brands || [],
                    removable,
                    confirmed
                });
            });

            return data;
        }

        /**
         * Apply to Post Meta (Allergens & Diets)
         */
        function applyToPostMeta(ingredientsData) {
            // Collect all unique allergens
            const allAllergens = new Set();
            const allDiets = new Set();

            ingredientsData.forEach(ingredient => {
                ingredient.allergens.forEach(a => allAllergens.add(a));
                ingredient.diets.forEach(d => allDiets.add(d));
            });

            // Update hidden checkboxes in the main form
            $('.clarivore-allergen-input').prop('checked', false);
            allAllergens.forEach(allergen => {
                $(`.clarivore-allergen-input[value="${allergen}"]`).prop('checked', true);
            });

            $('.clarivore-diet-input').prop('checked', false);
            allDiets.forEach(diet => {
                $(`.clarivore-diet-input[value="${diet}"]`).prop('checked', true);
            });

            // Update allergens display
            const $allergensDisplay = $('#clarivore-allergens-display');
            if (allAllergens.size > 0) {
                const allergenBadges = Array.from(allAllergens).map(a =>
                    `<span class="allergen-badge" style="padding: 6px 12px; font-size: 13px;">${capitalize(a.replace('-', ' '))}</span>`
                ).join('');
                $allergensDisplay.html(`<div style="display: flex; flex-wrap: wrap; gap: 8px;">${allergenBadges}</div>`);
            } else {
                $allergensDisplay.html('<p style="color: #646970; font-style: italic; margin: 0;">No allergens detected.</p>');
            }

            // Update diets display
            const $dietsDisplay = $('#clarivore-diets-display');
            if (allDiets.size > 0) {
                const dietBadges = Array.from(allDiets).map(d =>
                    `<span class="diet-badge" style="padding: 6px 12px; font-size: 13px;">${d}</span>`
                ).join('');
                $dietsDisplay.html(`<div style="display: flex; flex-wrap: wrap; gap: 8px;">${dietBadges}</div>`);
            } else {
                $dietsDisplay.html('<p style="color: #646970; font-style: italic; margin: 0;">No dietary preferences detected.</p>');
            }

            // Collect removable items (ingredients where removable checkbox is checked)
            const removableIngredients = ingredientsData
                .filter(i => i.removable === true)
                .map(i => i.name);

            const removableText = removableIngredients.join(', ');

            // Update removable display
            const $removableDisplay = $('#clarivore-removable-display');
            if (removableIngredients.length > 0) {
                $removableDisplay.html(`<p style="margin: 0; font-weight: 500;">${escapeHtml(removableText)}</p>`);
            } else {
                $removableDisplay.html('<p style="color: #646970; font-style: italic; margin: 0;">No removable ingredients specified.</p>');
            }

            // Highlight the changes
            $('.clarivore-section').css('background-color', '#fffbcc');
            setTimeout(() => {
                $('.clarivore-section').css('background-color', '');
            }, 2000);
        }

        /**
         * Brand Memory Functions
         */
        function rememberBrand(ingredientName, brandData) {
            const key = normalizeIngredientName(ingredientName);
            aiAssistState.brandMemory[key] = {
                name: brandData.name,
                brand: brandData.brand,
                brandImage: brandData.image || brandData.brandImage,
                ingredientsImage: brandData.ingredientsImage,
                ingredientsList: brandData.ingredientsList || [],
                allergens: brandData.allergens || []
            };
            saveBrandMemory();
        }

        function getRememberedBrand(ingredientName) {
            const key = normalizeIngredientName(ingredientName);
            return aiAssistState.brandMemory[key] || null;
        }

        function loadBrandMemory() {
            // Load from WordPress user meta or option
            const saved = localStorage.getItem('clarivore_brand_memory');
            if (saved) {
                try {
                    aiAssistState.brandMemory = JSON.parse(saved);
                } catch (e) {
                    aiAssistState.brandMemory = {};
                }
            }
        }

        function saveBrandMemory() {
            localStorage.setItem('clarivore_brand_memory', JSON.stringify(aiAssistState.brandMemory));
        }

        /**
         * Show Status Message
         */
        function showStatus(message, type) {
            const $status = $('#clarivore-ai-status');
            $status
                .removeClass('info success error warning')
                .addClass(type)
                .html(message)
                .fadeIn();
        }

        /**
         * Image Modal
         */
        window.openImageModal = function(imageUrl) {
            const $modal = $(`
                <div class="clarivore-image-modal">
                    <button class="clarivore-image-modal-close">&times;</button>
                    <img src="${imageUrl}" alt="Enlarged view" />
                </div>
            `);

            $('body').append($modal);
            $modal.fadeIn(200);

            $modal.on('click', function(e) {
                if ($(e.target).hasClass('clarivore-image-modal') || $(e.target).hasClass('clarivore-image-modal-close')) {
                    $modal.fadeOut(200, function() {
                        $modal.remove();
                    });
                }
            });
        };

        /**
         * Utility Functions
         */
        /**
         * Compress image to base64 with max dimensions and quality
         * Using same settings as the original working restaurant.html
         */
        function compressImage(url, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
            return new Promise((resolve, reject) => {
                const img = new Image();

                // Don't set crossOrigin for same-origin images (WordPress media library)
                // This prevents CORS errors
                if (!url.startsWith(window.location.origin)) {
                    img.crossOrigin = 'Anonymous';
                }

                img.onload = function() {
                    try {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;

                        console.log('Original image dimensions:', width + 'x' + height);

                        // Calculate new dimensions while maintaining aspect ratio
                        if (width > height) {
                            if (width > maxWidth) {
                                height *= maxWidth / width;
                                width = maxWidth;
                            }
                        } else {
                            if (height > maxHeight) {
                                width *= maxHeight / height;
                                height = maxHeight;
                            }
                        }

                        canvas.width = width;
                        canvas.height = height;

                        console.log('Compressed image dimensions:', width + 'x' + height);

                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        // Convert to base64 with compression
                        const base64 = canvas.toDataURL('image/jpeg', quality);
                        console.log('Base64 conversion successful');
                        resolve(base64);
                    } catch (error) {
                        console.error('Error compressing image:', error);
                        reject(error);
                    }
                };

                img.onerror = function(error) {
                    console.error('Failed to load image:', url, error);
                    reject(new Error('Failed to load image: ' + url));
                };

                console.log('Loading image from:', url);
                img.src = url;
            });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function capitalize(str) {
            return str.charAt(0).toUpperCase() + str.slice(1);
        }

    }); // end document.ready

})(jQuery);
