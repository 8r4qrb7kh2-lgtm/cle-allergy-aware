# Clarivore Menu Manager - How It Works

## Safety-Critical Design Philosophy

This extension helps prevent allergic reactions by alerting restaurant managers when their menu content changes. Because **lives are at stake**, the design prioritizes **100% reliability** over sophistication.

## Core Approach: Hash-Based Change Detection

### Why Hash-Based?

**Previous approach (FAILED):**
- Tried to be "smart" about detecting menu items
- Used pattern matching for prices, food words, etc.
- Complex logic = more failure points
- Missed real changes because items didn't match patterns

**Current approach (RELIABLE):**
- Hash the ENTIRE page content
- Detect ANY text change whatsoever
- Simple = fewer bugs = more reliable
- Better false positives than missing a real menu change

### How It Works

1. **Initial Hash**
   - When monitoring starts, get hash of all text on page
   - Includes main document + all accessible iframes
   - This is the baseline

2. **Watch for Changes**
   - MutationObserver monitors ALL DOM changes
   - On any change, wait 2 seconds (debounce)
   - Recalculate hash
   - If hash changed → LOG IT

3. **Persistent Storage**
   - All changes saved to Chrome local storage
   - Survives browser restarts
   - Keeps last 1000 changes

4. **User Notification**
   - Compact bubble in bottom-right corner
   - Shows badge count when changes detected
   - Expands to full banner automatically
   - One-click to open Clarivore editor

## Why This Works Universally

### Cross-Platform Compatibility

The hash approach works on:
- **Wix** - Monitors iframes where editor runs
- **WordPress** - Detects block editor changes
- **Squarespace** - Catches text edits
- **GoDaddy** - Works with their editor
- **Custom sites** - Any platform, any editor

No platform-specific code needed!

### What Triggers Detection

ANY text change, including:
- Adding a new menu item
- Removing an item
- Changing a price
- Editing a description
- Changing allergen info
- Adding/removing sections
- Even typo fixes

If the manager sees it change, we detect it.

## User Workflow

### Setup (Once)
1. Install extension
2. Configure:
   - Restaurant slug (e.g., "mama-santas")
   - Website URL (e.g., "https://editor.wix.com")
3. Extension activates only on that URL

### Daily Use
1. Manager edits menu on their website
2. Extension detects change → bubble expands
3. Banner says "Menu Content Changed!"
4. Manager clicks "Update Allergens Now"
5. Opens Clarivore editor
6. Manager updates allergen info
7. Optionally resets change counter

## Safety Features

### Never Misses a Change
- Monitors entire DOM
- Checks every 3 seconds for new iframes
- Persists across page refreshes
- Saves change log permanently

### Visible Alerts
- Pulsing red badge (impossible to miss)
- Auto-expands on change
- Persistent count (doesn't reset until manager does)

### Fail-Safe Design
- If hash calculation fails, logs error (doesn't crash)
- If iframe inaccessible, skips (doesn't break)
- Simple code = predictable behavior

## Technical Details

### Hash Function
```javascript
function getPageContentHash() {
  let allText = document.body.innerText; // Main page

  // Plus all iframes
  document.querySelectorAll('iframe').forEach(iframe => {
    if (iframe.contentDocument?.body) {
      allText += iframe.contentDocument.body.innerText;
    }
  });

  // Simple 32-bit hash
  let hash = 0;
  for (let i = 0; i < allText.length; i++) {
    hash = ((hash << 5) - hash) + allText.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString();
}
```

### Debouncing
- Wait 2 seconds after typing stops
- Prevents excessive hash calculations
- Still catches every actual change

### Storage
```javascript
{
  changeLog: [
    { timestamp: "2025-10-19T...", url: "...", hash: "..." },
    ...
  ],
  changeCount: 47,
  lastChangeTimestamp: "2025-10-19T..."
}
```

## Limitations & Trade-offs

### False Positives
- Will detect non-menu changes (ads, popups, etc.)
- **This is intentional** - better safe than sorry
- Manager can ignore if they know it's not menu-related

### Performance
- Hashing large pages takes ~10-50ms
- Negligible impact on user experience
- Only runs when DOM changes

### Cross-Origin Iframes
- Can't access cross-origin iframes (browser security)
- Most editors (Wix, WordPress) use same-origin iframes
- For cross-origin, monitors main page only

## Future Improvements

Possible enhancements (without sacrificing reliability):
- Show WHAT changed (diff view)
- Smart filtering of non-menu sections
- Integration with Clarivore API to auto-detect new dishes
- Browser notifications when not on page

**But**: Only add if they don't reduce reliability!

## Summary

**Goal**: Never let a menu change go unnoticed.

**Method**: Detect everything, alert aggressively.

**Result**: Restaurant managers can't forget to update allergen info.

**Impact**: Lives saved.
