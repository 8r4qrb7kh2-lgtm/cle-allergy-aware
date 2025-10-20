# Clarivore GoDaddy Integration

This integration allows restaurants using GoDaddy Website Builder to display Clarivore allergen badges on their menu items.

## Installation for Mama Santa's (or any GoDaddy site)

### Step 1: Add the Script to GoDaddy

1. Log in to your GoDaddy Website Builder
2. Click **Settings** (gear icon)
3. Navigate to **Advanced** > **SEO** or **Header Code**
4. Paste the following code in the **Header Code** section:

```html
<script>
// Paste the contents of clarivore-embed.js here
</script>
```

### Step 2: Configure Restaurant Slug

In the script, find this line:

```javascript
restaurantSlug: 'mama-santas',
```

Change `'mama-santas'` to match your restaurant's slug in Clarivore.

### Step 3: Mark Menu Items (Two Options)

#### Option A: Automatic Detection (Recommended)

The script will automatically try to match menu items by name. Just make sure your Clarivore dish names match the names on your website exactly.

#### Option B: Manual Marking

Add `data-clarivore-dish="DISH_ID"` to specific menu items:

**Example for Mama Santa's:**

Before editing the page, you'll need to get the dish IDs from Clarivore. Then, in your GoDaddy page editor:

1. Click on the menu item you want to add badges to
2. Go to the HTML/Code editor
3. Find the menu item container (usually has `data-aid="MENU_ITEM_..."`)
4. Add the attribute: `data-clarivore-dish="Penne with Meat Balls"`

**Example HTML:**

```html
<div data-aid="MENU_ITEM_PENNEWITHMEAT" data-clarivore-dish="Penne with Meat Balls">
  <h4>Penne with Meat Balls</h4>
  <p>Delicious pasta with homemade meatballs</p>
  <span class="price">$14.95</span>
  <!-- Clarivore badges will be inserted here automatically -->
</div>
```

## How It Works

1. **Script loads** when the page loads
2. **Fetches restaurant data** from Clarivore's Supabase database
3. **Finds menu items** either by:
   - Looking for `data-clarivore-dish` attributes you added manually, OR
   - Auto-matching menu items by comparing dish names
4. **Inserts allergen badges** below each menu item with styling that matches your site

## Badge Appearance

Badges will appear like this:

- 🥜 Contains peanut
- 🥛 Contains milk (can be removed)
- 🌾 Contains wheat
- 🦐 Contains shellfish

Each allergen has a distinct color:
- **Yellow**: Peanut, Egg, Sesame
- **Red**: Tree nuts, Wheat, Shellfish, Gluten
- **Blue**: Milk, Fish
- **Green**: Soy

## Customization

### Badge Styling

To customize badge appearance, edit the `badgeStyles` object in the script:

```javascript
badgeStyles: {
  fontSize: '11px',        // Change badge text size
  padding: '3px 8px',      // Change badge padding
  borderRadius: '12px',    // Change badge roundness
  margin: '2px',           // Space between badges
  fontWeight: '600'        // Badge text weight
}
```

### Colors

To change allergen colors, edit the `allergenColors` object:

```javascript
allergenColors: {
  'peanut': {
    bg: '#FFF3CD',        // Background color
    color: '#856404',     // Text color
    emoji: '🥜'           // Icon
  },
  // ... more allergens
}
```

## Troubleshooting

### Badges Don't Appear

1. **Check browser console** (F12) for error messages
2. **Verify restaurant slug** matches exactly
3. **Check dish names** match between website and Clarivore exactly
4. **Try manual mode** by adding `data-clarivore-dish` attributes

### Console Commands

Open browser console (F12) and try:

```javascript
// Reload/refresh badges
window.Clarivore.reload();

// Check configuration
console.log(window.Clarivore.config);
```

### View Loaded Data

```javascript
// This will show what dishes were loaded from Clarivore
// (Note: This requires modifying the script to expose restaurantData)
```

## Example for Mama Santa's Menu

Based on the Mama Santa's website structure, here's how dishes would be automatically detected:

**HTML from their site:**
```html
<div data-aid="MENU_ITEM_LARGEPIZZA">
  <h4 data-aid="MENU_SECTION0_ITEM0_TITLE">Large Pizza</h4>
  <div data-aid="MENU_SECTION0_ITEM0_DESC">15 inch, 12 cut</div>
  <div data-aid="MENU_SECTION0_ITEM0_PRICE">$13.95</div>
</div>
```

**What the script does:**
1. Finds the heading "Large Pizza"
2. Looks up "Large Pizza" in Clarivore database
3. If found, adds allergen badges automatically

**Result:**
```html
<div data-aid="MENU_ITEM_LARGEPIZZA" data-clarivore-dish="Large Pizza">
  <h4>Large Pizza</h4>
  <div>15 inch, 12 cut</div>
  <div>$13.95</div>
  <div class="clarivore-badges">
    <span>🌾 Contains wheat</span>
    <span>🥛 Contains milk</span>
  </div>
</div>
```

## Support

If you need help integrating Clarivore with your GoDaddy website, contact support@clarivore.org
