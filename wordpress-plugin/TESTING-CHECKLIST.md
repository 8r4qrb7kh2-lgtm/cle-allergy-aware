# WordPress Plugin Testing Checklist

## Pre-Installation Tests

- [ ] Plugin folder is named correctly: `clarivore-menu-integration`
- [ ] All files are present (see PLUGIN-SUMMARY.md)
- [ ] No syntax errors in PHP files
- [ ] Restaurant exists in Clarivore database with valid slug

## Installation Tests

- [ ] Plugin uploads successfully via WordPress admin
- [ ] Plugin activates without errors
- [ ] No PHP warnings or notices appear
- [ ] "Clarivore" menu item appears in WordPress admin sidebar
- [ ] "Menu Items" post type appears in sidebar

## Settings Page Tests

- [ ] Can navigate to Clarivore > Settings
- [ ] Settings page displays correctly
- [ ] Can enter Restaurant Slug/ID
- [ ] Can toggle Auto-Sync checkbox
- [ ] Can save settings successfully
- [ ] Settings persist after page reload
- [ ] Help documentation displays

## Menu Item Creation Tests

- [ ] Can navigate to Menu Items > Add New
- [ ] Standard WordPress editor loads
- [ ] Can enter menu item title
- [ ] Can enter description
- [ ] Can add featured image
- [ ] Clarivore meta box appears below editor
- [ ] Meta box displays all sections:
  - [ ] AI Analysis section
  - [ ] Allergens section
  - [ ] Dietary Preferences section
  - [ ] Removable Ingredients section
  - [ ] Cross-Contamination section
  - [ ] Sync Status section

## Allergen Selection Tests

- [ ] Can check allergen checkboxes
- [ ] Can uncheck allergen checkboxes
- [ ] All 10 allergens display correctly:
  - [ ] Dairy
  - [ ] Eggs
  - [ ] Fish
  - [ ] Shellfish
  - [ ] Tree Nuts
  - [ ] Peanuts
  - [ ] Wheat
  - [ ] Gluten
  - [ ] Soy
  - [ ] Sesame
- [ ] Checked items show visual indication (bold text)

## Dietary Preference Tests

- [ ] Can check dietary checkboxes
- [ ] Can uncheck dietary checkboxes
- [ ] All 8 diets display correctly:
  - [ ] Vegetarian
  - [ ] Vegan
  - [ ] Gluten-Free
  - [ ] Dairy-Free
  - [ ] Keto
  - [ ] Paleo
  - [ ] Halal
  - [ ] Kosher
- [ ] Checked items show visual indication

## Removable Ingredients Tests

- [ ] Can type in removable ingredients textarea
- [ ] Text persists after save
- [ ] Accepts comma-separated values
- [ ] Handles special characters correctly

## Cross-Contamination Tests

- [ ] Can check cross-contamination boxes
- [ ] All allergens appear as cross-contamination options
- [ ] Selections persist after save

## Save/Publish Tests

- [ ] Can save as draft
- [ ] Can publish menu item
- [ ] All allergen selections save correctly
- [ ] All dietary selections save correctly
- [ ] Removable ingredients save correctly
- [ ] Cross-contamination selections save correctly
- [ ] No errors on save

## Auto-Sync Tests

### With Auto-Sync Enabled:

- [ ] Enable Auto-Sync in settings
- [ ] Create new menu item with allergen data
- [ ] Publish the item
- [ ] Check Clarivore database (Supabase)
- [ ] Verify restaurant's overlays array updated
- [ ] Menu item data appears correctly:
  - [ ] id matches dish name
  - [ ] allergens array is correct
  - [ ] diets array is correct
  - [ ] removable array is correct
  - [ ] crossContamination array is correct
- [ ] Update existing menu item
- [ ] Verify changes sync to database

### With Auto-Sync Disabled:

- [ ] Disable Auto-Sync in settings
- [ ] Create/update menu item
- [ ] Verify data does NOT sync to Clarivore
- [ ] Data still saves locally in WordPress

## AI Analysis Tests (If Proxy Configured)

- [ ] Click "Analyze with AI" button
- [ ] Button shows "Analyzing..." state
- [ ] Button is disabled during analysis
- [ ] Success message appears when complete
- [ ] Allergen checkboxes auto-populate
- [ ] Dietary checkboxes auto-populate
- [ ] Removable ingredients auto-populate
- [ ] Can manually adjust AI suggestions
- [ ] Error message shows if analysis fails

## Validation Tests

- [ ] Warning shows when Vegan + Dairy selected
- [ ] Warning shows when Vegan + Eggs selected
- [ ] Warning styling displays correctly
- [ ] Warning disappears when conflict resolved

## Multiple Menu Items Tests

- [ ] Can create multiple menu items
- [ ] Each item saves independently
- [ ] Each item syncs independently
- [ ] Can edit existing items
- [ ] Can delete items
- [ ] Menu Items list shows all items

## UI/UX Tests

- [ ] Checkboxes are easy to click
- [ ] Labels are readable
- [ ] Colors are appropriate
- [ ] Hover states work
- [ ] No layout issues
- [ ] Sections are well-organized
- [ ] Instructions are clear

## Responsive Design Tests

- [ ] Meta box displays correctly on desktop
- [ ] Meta box displays correctly on tablet
- [ ] Meta box displays correctly on mobile
- [ ] Checkboxes stack properly on small screens
- [ ] Buttons are accessible on touch devices

## Browser Compatibility Tests

- [ ] Works in Chrome
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Works in Edge
- [ ] No JavaScript console errors

## JavaScript Tests

- [ ] admin.js loads without errors
- [ ] jQuery dependency loads
- [ ] AJAX calls work correctly
- [ ] No console warnings
- [ ] Event handlers attach properly

## CSS Tests

- [ ] admin.css loads correctly
- [ ] Styles apply to meta box
- [ ] No CSS conflicts with WordPress core
- [ ] No CSS conflicts with theme
- [ ] Transitions work smoothly

## Security Tests

- [ ] Nonce verification works
- [ ] Non-admin users cannot access settings
- [ ] Non-editors cannot edit menu items
- [ ] Direct file access is blocked (index.php files)
- [ ] Data is sanitized on save
- [ ] XSS protection in place

## Error Handling Tests

- [ ] Missing restaurant ID shows appropriate error
- [ ] Invalid Supabase URL shows error
- [ ] Network errors are caught gracefully
- [ ] Database errors are logged
- [ ] User sees friendly error messages

## Integration Tests

### With Standard WordPress:

- [ ] Works with default theme (Twenty Twenty-Four)
- [ ] Works with Gutenberg editor
- [ ] Works with Classic editor

### With Popular Plugins:

- [ ] Compatible with Yoast SEO
- [ ] Compatible with Akismet
- [ ] No conflicts with common plugins

## Performance Tests

- [ ] Plugin doesn't slow down WordPress admin
- [ ] Assets only load on relevant pages
- [ ] No excessive database queries
- [ ] Sync completes in reasonable time (<3 seconds)
- [ ] No memory leaks

## Data Integrity Tests

- [ ] Data in WordPress matches data in Clarivore
- [ ] Updates reflect correctly in both systems
- [ ] No data loss on save
- [ ] Special characters handled correctly
- [ ] Empty values handled correctly

## Edge Cases

- [ ] Menu item with no allergens
- [ ] Menu item with all allergens
- [ ] Menu item with very long name
- [ ] Menu item with special characters in name
- [ ] Menu item with no description
- [ ] Restaurant with no existing overlays
- [ ] Restaurant with 100+ existing overlays

## Cleanup Tests

- [ ] Can deactivate plugin without errors
- [ ] Can reactivate plugin
- [ ] Settings persist after deactivation
- [ ] Menu items persist after deactivation
- [ ] Can delete plugin cleanly (if needed)

## Documentation Tests

- [ ] README.md is clear and helpful
- [ ] INSTALL.md instructions work
- [ ] USAGE-EXAMPLES.md examples are accurate
- [ ] Code comments are sufficient
- [ ] No broken links in documentation

## Final Verification

- [ ] Complete end-to-end workflow works:
  1. Install plugin
  2. Configure settings
  3. Create menu item
  4. Add allergen data
  5. Publish
  6. Verify sync to Clarivore
  7. View in Clarivore app
  8. Update menu item
  9. Verify update syncs
- [ ] Restaurant owner can use without technical knowledge
- [ ] No critical bugs found
- [ ] Ready for production use

---

## Test Results

**Date Tested**: _______________

**WordPress Version**: _______________

**PHP Version**: _______________

**Tester**: _______________

**Overall Status**: ⬜ Pass  ⬜ Fail  ⬜ Needs Work

**Notes**:
```
[Add any issues, observations, or recommendations here]
```

**Critical Issues Found**:
```
[List any blocking issues]
```

**Non-Critical Issues**:
```
[List minor issues or enhancements]
```
