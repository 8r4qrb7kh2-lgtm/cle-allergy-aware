# 🧪 Testing Guide - AI Menu Monitor

Comprehensive testing instructions to validate the extension works across all platforms.

## 📋 Pre-Testing Checklist

Before starting tests, ensure:

- [ ] Extension is installed in Chrome
- [ ] Claude API key is configured in Settings
- [ ] You have API credits available ($5 minimum recommended)
- [ ] Chrome Developer Tools is accessible
- [ ] You can access restaurant websites

## 🎯 Phase 1: Core Functionality Tests

### Test 1.1: Basic Analysis

**Objective:** Verify AI can extract menu items from a simple page

**Steps:**
1. Visit: https://www.example-restaurant.com/menu (any simple menu page)
2. Click extension icon
3. Click "Analyze This Page"
4. Wait for analysis to complete (5-15 seconds)

**Expected Results:**
- ✅ Status shows "Analyzing page..."
- ✅ Analysis completes without errors
- ✅ Menu items are displayed in popup
- ✅ Each item shows name, description, detected allergens
- ✅ Confidence scores are reasonable (>0.7)

**Pass Criteria:**
- At least 50% of visible menu items detected
- No JavaScript errors in console
- Analysis completes within 30 seconds

### Test 1.2: Monitoring Setup

**Objective:** Start monitoring a site

**Steps:**
1. On the same menu page, click "Start Monitoring"
2. Enter name: "Test Restaurant 1"
3. Wait for confirmation

**Expected Results:**
- ✅ Button changes to "Stop Monitoring"
- ✅ Site appears in "Monitored Sites" list
- ✅ Last checked timestamp is current
- ✅ Change count is 0

### Test 1.3: Manual Change Detection

**Objective:** Trigger a manual check for changes

**Steps:**
1. In "Monitored Sites", click "Check" button
2. Wait for check to complete

**Expected Results:**
- ✅ Status shows "Checking for changes..."
- ✅ Check completes successfully
- ✅ No changes detected (menu hasn't changed)
- ✅ "Last checked" timestamp updates

## 🌐 Phase 2: Platform Compatibility Tests

Test the extension on different website platforms:

### Test 2.1: WordPress Site

**Test Sites:**
- Find a restaurant using WordPress (check for `wp-content` in source)
- Example: Many small restaurant blogs

**Steps:**
1. Navigate to menu page
2. Analyze page
3. Start monitoring

**Validation:**
- ✅ Menu items detected
- ✅ Allergen information extracted (if present)
- ✅ No platform-specific errors

### Test 2.2: Wix Site

**Test Sites:**
- Find restaurant using Wix (check for `wix.com` in source)
- Example: Many local restaurants use Wix

**Steps:**
1. Navigate to menu page (might be under "Order" or "Menu")
2. Analyze page
3. Verify items detected

**Validation:**
- ✅ Works with Wix's JavaScript-heavy structure
- ✅ Handles dynamic content loading
- ✅ Screenshot capture works

### Test 2.3: Squarespace Site

**Test Sites:**
- Find restaurant on Squarespace
- Check for `squarespace` in page source

**Steps:**
1. Navigate to menu page
2. Analyze page
3. Check for completeness

**Validation:**
- ✅ Menu sections detected
- ✅ Images don't break analysis
- ✅ Prices extracted correctly

### Test 2.4: Custom React/Vue SPA

**Test Sites:**
- Modern restaurant websites (often fine dining)
- Check for React/Vue in console or source

**Steps:**
1. Wait for page to fully load
2. Analyze page
3. Verify dynamic content handled

**Validation:**
- ✅ Handles client-side rendering
- ✅ No missing items from late loading
- ✅ State changes don't cause issues

### Test 2.5: PDF Menu

**Test Sites:**
- Restaurant that links to PDF menu
- Example: Many traditional restaurants

**Steps:**
1. Navigate to page with PDF menu
2. Open PDF in browser
3. Analyze page

**Validation:**
- ✅ Extension recognizes it's a PDF
- ✅ Visual analysis captures PDF content
- ✅ Menu items extracted from PDF

### Test 2.6: Image-Based Menu

**Test Sites:**
- Restaurant with menu as JPEG/PNG images

**Steps:**
1. Navigate to menu page
2. Ensure Visual Analysis is enabled in settings
3. Analyze page

**Validation:**
- ✅ Claude Vision API processes images
- ✅ Menu items extracted from images
- ✅ OCR quality is acceptable

## 🔍 Phase 3: AI Accuracy Tests

### Test 3.1: Allergen Detection

**Setup:** Find menu items with clear allergen mentions

**Test Cases:**

| Menu Item | Expected Detection |
|-----------|-------------------|
| "Grilled chicken with BUTTER sauce" | ✅ Dairy detected |
| "Pasta with MAYO-based dressing" | ✅ Eggs detected (mayo = eggs) |
| "Fried in PEANUT OIL" | ✅ Nuts detected |
| "Contains WHEAT flour" | ✅ Gluten detected |
| "Made with SOY sauce" | ✅ Soy detected |

**Validation:**
- ✅ Direct allergens detected (100% accuracy)
- ✅ Implicit allergens detected (>80% accuracy)
- ✅ Confidence scores reflect certainty

### Test 3.2: Hidden Allergen Detection

**Test Cases:**

| Ingredient | Hidden Allergen | Should Detect? |
|------------|----------------|---------------|
| "Mayonnaise" | Eggs | ✅ Yes |
| "Butter" | Dairy | ✅ Yes |
| "Worcestershire" | Fish (anchovies) | ✅ Yes |
| "Pesto" | Nuts (pine nuts) | ✅ Yes |
| "Miso" | Soy | ✅ Yes |

**Validation:**
- Test with menu items containing these ingredients
- Verify AI correctly identifies hidden allergens

### Test 3.3: Cross-Contamination Warnings

**Test Cases:**

| Warning Text | Should Detect? |
|--------------|---------------|
| "May contain traces of nuts" | ✅ Yes |
| "Processed in facility with dairy" | ✅ Yes |
| "Shared fryer with shellfish items" | ✅ Yes |
| "Cannot guarantee allergen-free" | ✅ Yes |

**Validation:**
- AI includes warnings in analysis
- Warnings appear in ambiguousItems field

### Test 3.4: Semantic Understanding

**Test Cases:**

| Old Text | New Text | Expected Change Type |
|----------|----------|---------------------|
| "Grilled chicken" | "Fried chicken" | ✅ Preparation change (important) |
| "With vinaigrette" | "With caesar dressing" | ✅ Allergen added (critical) |
| "Gluten-free pasta" | "Regular pasta" | ✅ Allergen added (critical) |
| "$12" | "$14" | ❌ Price change (ignore) |
| "Fresh tomato" | "Ripe tomato" | ❌ Cosmetic (ignore) |

**Validation:**
- Run comparison tests with these changes
- Verify correct categorization and severity

## 🔄 Phase 4: Change Detection Tests

### Test 4.1: Simulated Menu Change

**Setup:**
1. Monitor a test page (create your own HTML page if needed)
2. Make controlled changes to the page
3. Re-analyze to detect changes

**Test Case 1: Add New Allergen**

**Before:**
```html
<div class="menu-item">
  <h3>Greek Salad</h3>
  <p>Fresh vegetables with olive oil (Vegan)</p>
</div>
```

**After:**
```html
<div class="menu-item">
  <h3>Greek Salad</h3>
  <p>Fresh vegetables with feta cheese (Vegetarian)</p>
</div>
```

**Expected:**
- ✅ Detects dairy allergen added
- ✅ Severity: CRITICAL
- ✅ Notes vegan → vegetarian change

**Test Case 2: Remove Dish**

**Action:** Delete a menu item from the page

**Expected:**
- ✅ Detects item removal
- ✅ Severity: IMPORTANT
- ✅ Shows old item details

**Test Case 3: Price Change Only**

**Action:** Change "$10" to "$12"

**Expected:**
- ❌ Should NOT notify (cosmetic change)
- Or if detected, severity: MINOR

### Test 4.2: Real-World Change Detection

**Setup:**
1. Find a restaurant that updates daily specials
2. Monitor the page
3. Check next day when specials change

**Validation:**
- ✅ Detects new dishes
- ✅ Detects removed dishes
- ✅ Provides meaningful change summary

## ⚡ Phase 5: Performance Tests

### Test 5.1: Analysis Speed

**Metrics to Track:**

| Page Type | Expected Time |
|-----------|--------------|
| Simple HTML menu | < 10 seconds |
| Complex SPA | < 20 seconds |
| Image-based menu | < 30 seconds |
| Large menu (50+ items) | < 45 seconds |

**Test:**
1. Time each analysis from click to results
2. Test with different menu sizes
3. Compare HTML-only vs HTML+Visual

### Test 5.2: API Cost Tracking

**Objective:** Verify cost estimates are accurate

**Method:**
1. Note API usage before test
2. Run 10 analyses on different sites
3. Check API usage after
4. Compare to extension's cost estimate

**Expected:**
- Cost estimate within 20% of actual

### Test 5.3: Caching Effectiveness

**Test:**
1. Enable caching in settings
2. Analyze same page twice within 24 hours
3. Check API logs

**Expected:**
- ✅ Second analysis uses cache (no API call)
- ✅ Results returned instantly (<1 second)
- ✅ Cache expires after 24 hours

## 🔐 Phase 6: Security & Privacy Tests

### Test 6.1: API Key Security

**Validation:**
1. Open Chrome DevTools → Application → Storage
2. Find API key in local storage
3. Verify it's not exposed in:
   - Console logs
   - Network tab (except to Anthropic API)
   - Page source

**Expected:**
- ✅ API key stored locally only
- ✅ Transmitted only to api.anthropic.com
- ✅ HTTPS used for all API calls

### Test 6.2: Data Privacy

**Validation:**
1. Check network tab during analysis
2. Verify no data sent to third parties
3. Confirm all storage is local

**Expected:**
- ✅ No external tracking
- ✅ No analytics sent
- ✅ All data in chrome.storage.local

## 🎯 Phase 7: Error Handling Tests

### Test 7.1: Invalid API Key

**Steps:**
1. Enter invalid API key in settings
2. Try to analyze a page

**Expected:**
- ✅ Clear error message
- ✅ Prompt to check API key
- ✅ No crash

### Test 7.2: Network Failure

**Steps:**
1. Disconnect internet
2. Try to analyze a page

**Expected:**
- ✅ Graceful error handling
- ✅ Helpful error message
- ✅ Retry mechanism activates when online

### Test 7.3: Rate Limiting

**Steps:**
1. Trigger many rapid analyses (>10 in 1 minute)
2. Observe behavior

**Expected:**
- ✅ Exponential backoff activates
- ✅ User notified of rate limit
- ✅ Queued for retry

### Test 7.4: Malformed Page

**Steps:**
1. Visit page with broken HTML
2. Analyze page

**Expected:**
- ✅ Extension doesn't crash
- ✅ Returns empty menu items array
- ✅ Helpful message to user

## 📊 Test Results Template

Use this template to track test results:

```markdown
## Test Session: [Date]

**Tester:** [Name]
**Chrome Version:** [Version]
**Extension Version:** 2.0.0

### Phase 1: Core Functionality
- [x] Test 1.1: Basic Analysis - PASS
- [x] Test 1.2: Monitoring Setup - PASS
- [x] Test 1.3: Manual Detection - PASS

### Phase 2: Platform Compatibility
- [x] Test 2.1: WordPress - PASS
- [x] Test 2.2: Wix - PASS
- [ ] Test 2.3: Squarespace - SKIP (no test site found)
- [x] Test 2.4: React SPA - PASS
- [x] Test 2.5: PDF Menu - FAIL (see notes)
- [x] Test 2.6: Image Menu - PASS

### Issues Found:
1. PDF analysis fails on Chrome mobile - **Priority: Medium**
2. Very large menus (>100 items) timeout - **Priority: Low**

### Notes:
- Average analysis time: 12 seconds
- Cost per analysis: ~$0.02
- Allergen detection accuracy: 94%
```

## ✅ Acceptance Criteria

The extension is ready for release when:

- [ ] All Phase 1 tests pass (100%)
- [ ] At least 5/6 Phase 2 tests pass (>80%)
- [ ] Phase 3 allergen tests achieve >90% accuracy
- [ ] Phase 4 change detection works on 3+ platforms
- [ ] Phase 5 performance within acceptable ranges
- [ ] Phase 6 security tests all pass (100%)
- [ ] Phase 7 error handling gracefully handles all scenarios
- [ ] No critical bugs found
- [ ] Documentation is complete

## 🚀 Ongoing Testing

After release, continue testing:

**Weekly:**
- Monitor a real restaurant for 1 week
- Verify change detection on actual menu updates

**Monthly:**
- Test on 3 new restaurant websites
- Validate cost estimates vs actual usage
- Check for Chrome updates compatibility

**Quarterly:**
- Full regression test suite
- Performance benchmarks
- Security audit

---

**Remember:** Testing with real API costs money. Start with small tests and scale up once confident in the implementation.
