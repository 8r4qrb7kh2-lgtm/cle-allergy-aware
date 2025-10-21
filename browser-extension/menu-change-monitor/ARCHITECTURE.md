# Architecture Overview - AI Menu Change Monitor

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Restaurant Website                            │
│  (WordPress / Wix / GoDaddy / Squarespace / Custom)             │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Menu Content (HTML)                                    │    │
│  │  • Dish names                                          │    │
│  │  • Descriptions                                        │    │
│  │  • Allergen info                                       │    │
│  │  • Prices                                              │    │
│  └────────────────────────────────────────────────────────┘    │
│                           │                                      │
│                           │ Manager edits menu                   │
│                           ▼                                      │
│                    DOM Changes                                   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ Observed by
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Content Script (contentScript.js)              │
│  Runs on every page | Watches for changes                       │
│                                                                   │
│  ┌──────────────────┐    ┌────────────────┐                    │
│  │ MutationObserver │───▶│ Change Filter  │                    │
│  │ Watches DOM      │    │ Ignores noise  │                    │
│  └──────────────────┘    └────────┬───────┘                    │
│                                    │                             │
│                                    ▼                             │
│  ┌──────────────────┐    ┌────────────────┐                    │
│  │ Menu Detector    │    │ Debouncer      │                    │
│  │ Finds menu text  │    │ Wait 2 seconds │                    │
│  └──────────────────┘    └────────┬───────┘                    │
│                                    │                             │
│                                    ▼                             │
│  ┌──────────────────────────────────────┐                      │
│  │ Snapshot Capture                      │                      │
│  │ • Current menu HTML                   │                      │
│  │ • Text content                        │                      │
│  │ • Changed sections                    │                      │
│  └──────────────────┬───────────────────┘                      │
└─────────────────────┼───────────────────────────────────────────┘
                      │
                      │ Send to background
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│           Background Worker (background.js)                      │
│  Service worker | Always running                                │
│                                                                   │
│  ┌────────────────────────────────────┐                        │
│  │ Receive Change Event                │                        │
│  │ • Old snapshot                      │                        │
│  │ • New snapshot                      │                        │
│  │ • Changed text                      │                        │
│  └────────────────┬───────────────────┘                        │
│                   │                                              │
│                   ▼                                              │
│  ┌────────────────────────────────────┐                        │
│  │ Quick Text Comparison               │                        │
│  │ Are they identical?                 │                        │
│  └────────┬──────────────┬────────────┘                        │
│           │ Yes          │ No                                   │
│           │              │                                       │
│     Return "no changes"  ▼                                      │
│                   ┌──────────────────┐                          │
│                   │  AI Analysis     │                          │
│                   │  (Claude API)    │                          │
│                   └────────┬─────────┘                          │
│                            │                                     │
│                            ▼                                     │
│  ┌────────────────────────────────────┐                        │
│  │ Parse AI Response                   │                        │
│  │ {                                   │                        │
│  │   hasChanges: true,                │                        │
│  │   changesSummary: "...",           │                        │
│  │   criticalChanges: [...]           │                        │
│  │ }                                   │                        │
│  └────────────────┬───────────────────┘                        │
│                   │                                              │
│                   ▼                                              │
│  ┌────────────────────────────────────┐                        │
│  │ Save to History                     │                        │
│  │ Update storage                      │                        │
│  └────────────────┬───────────────────┘                        │
│                   │                                              │
│                   │ Send result back                            │
└───────────────────┼─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│           Content Script (contentScript.js)                      │
│  Receives analysis result                                        │
│                                                                   │
│  ┌────────────────────────────────────┐                        │
│  │ If hasChanges = true               │                        │
│  └────────────────┬───────────────────┘                        │
│                   │                                              │
│                   ▼                                              │
│  ┌────────────────────────────────────┐                        │
│  │ Create Notification Popup           │                        │
│  │ • Animated slide-in                 │                        │
│  │ • Change description                │                        │
│  │ • "Update Allergy Info" button      │                        │
│  │ • Dismiss button                    │                        │
│  └────────────────┬───────────────────┘                        │
│                   │                                              │
│                   ▼                                              │
│  ┌────────────────────────────────────┐                        │
│  │ Inject into Page                    │                        │
│  │ Position: top-right                 │                        │
│  │ Z-index: 2147483647                 │                        │
│  └────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
                    │
                    │ User sees notification
                    ▼
         ┌─────────────────────┐
         │  Restaurant Manager │
         │  Clicks button      │
         └──────────┬──────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │  Your Allergy       │
         │  Website            │
         │  Update Form        │
         └─────────────────────┘
```

## 🔄 Data Flow

### 1. Initial Setup
```
Manager visits menu page
         │
         ▼
Extension icon clicked
         │
         ▼
"Start Monitoring" clicked
         │
         ▼
Content script activates
         │
         ▼
MutationObserver created
         │
         ▼
Initial snapshot captured
         │
         ▼
Saved to storage
```

### 2. Change Detection
```
Manager edits menu
         │
         ▼
DOM mutation event
         │
         ▼
Filter irrelevant changes
         │
         ▼
Add to change buffer
         │
         ▼
Start debounce timer (2s)
         │
         ▼
Timer expires
         │
         ▼
Extract changed text
         │
         ▼
Capture new snapshot
```

### 3. Analysis Flow
```
Send snapshots to background
         │
         ▼
Compare old vs new
         │
         ▼
Build AI prompt
         │
         ▼
Call Claude API (or demo mode)
         │
         ▼
Receive JSON response
         │
         ▼
Parse response
         │
         ▼
Determine if relevant
```

### 4. Notification Flow
```
If hasChanges = true
         │
         ▼
Create notification element
         │
         ▼
Style with CSS
         │
         ▼
Inject into page
         │
         ▼
Animate slide-in
         │
         ▼
Start auto-dismiss timer (30s)
```

## 🧩 Component Breakdown

### Content Script Components

```javascript
// Core monitoring
MutationObserver → handleMutations() → analyzeChanges()

// Menu detection
extractMenuContent() → looks for keywords
extractMenuText() → converts to plain text

// Snapshot management
captureMenuSnapshot() → {html, text, url, timestamp}

// Notification
showChangeNotification() → createNotificationElement()

// Storage
saveSnapshot() → Chrome storage API
```

### Background Worker Components

```javascript
// Message handling
onMessage → route to correct handler

// Analysis
analyzeMenuChanges() → calls AI
parseClaudeResponse() → extracts JSON

// API management
callClaudeAPI() → with retry logic
generateMockResponse() → for demo mode

// History
addToChangeHistory() → save to storage
getChangeHistory() → retrieve history
```

### Popup UI Components

```javascript
// Display
loadCurrentTab() → show current page
loadMonitoredSites() → show list
loadRecentChanges() → show history

// Controls
analyzeCurrentPage() → manual analysis
toggleMonitoring() → start/stop
```

## 🎯 Universal Detection Strategy

### Keyword-Based Approach

```
Look for elements containing:
┌─────────────────────────────┐
│ Food Keywords:              │
│ • appetizer, entree         │
│ • salad, sandwich           │
│ • burger, pizza, pasta      │
│ • dessert, etc.             │
├─────────────────────────────┤
│ Price Indicators:           │
│ • $, dollar, price          │
├─────────────────────────────┤
│ Allergen Keywords:          │
│ • gluten, dairy, nuts       │
│ • contains, allergen        │
│ • vegan, vegetarian         │
└─────────────────────────────┘
         │
         ▼
Score each element
         │
         ▼
Select highest scoring
         │
         ▼
Extract that section
```

### Platform Independence

```
WordPress                Wix                  GoDaddy
    │                     │                      │
    ├─ <section class="menu">
    ├─ <div id="wp-block">
    │
    ├─ <div class="wix-container">
    ├─ <div class="wix-menu-item">
    │
    └─ <div class="gd-menu">
       └─ <div class="gd-item">
         │
         ▼
    All analyze to:
    {
      text: "Dish name, description, price, allergens",
      html: "<div>...</div>"
    }
```

## 🔐 Security Architecture

### Data Flow Security

```
Local Browser Only:
┌─────────────────────┐
│ MutationObserver   │
│ (watches DOM)      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Content Script     │
│ (filters changes)  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Background Worker  │
│ (analyzes locally) │
└──────┬──────────────┘
       │
       ▼
External (only if needed):
┌─────────────────────┐
│ Claude API         │
│ (optional)         │
└────────────────────┘
```

### What Gets Sent to API

```
SENT to API:
• Menu text only (no user data)
• Public website URL
• Change descriptions

NOT SENT:
• User credentials
• Personal information
• Browsing history
• Other tab data
```

### Storage Security

```
Chrome Storage (local):
• Encrypted by Chrome
• Only accessible to extension
• Never synced to cloud
• Cleared on uninstall
```

## ⚡ Performance Optimization

### Debouncing Strategy

```
Without debouncing:
Edit "G" → Analyze
Edit "Gl" → Analyze
Edit "Glu" → Analyze
Edit "Glut" → Analyze
Edit "Glute" → Analyze
Edit "Gluten" → Analyze
└─ 6 API calls! 💸

With debouncing:
Edit "G" → Wait...
Edit "Gl" → Wait...
Edit "Glu" → Wait...
Edit "Glut" → Wait...
Edit "Glute" → Wait...
Edit "Gluten" → Wait 2s → Analyze
└─ 1 API call! ✅
```

### Cooldown Strategy

```
Without cooldown:
Change 1 → Analyze → Notify
Change 2 → Analyze → Notify (1 second later)
Change 3 → Analyze → Notify (2 seconds later)
└─ Spam! User annoyed! 😠

With cooldown:
Change 1 → Analyze → Notify
Change 2 → Skip (cooldown active)
Change 3 → Skip (cooldown active)
... wait 30 seconds ...
Change 4 → Analyze → Notify
└─ User-friendly! ✅
```

### Filtering Strategy

```
Total DOM mutations: 1000+
         │
         ▼
Filter scripts/styles: 800+
         │
         ▼
Filter ads/tracking: 100+
         │
         ▼
Filter formatting: 50+
         │
         ▼
Menu-related only: 5-10
         │
         ▼
Meaningful threshold: 2-3
         │
         ▼
Actually analyzed: 1-2
```

## 🎨 UI/UX Architecture

### Notification Positioning

```
Browser Window
┌─────────────────────────────────┐
│ [URL Bar]                        │
├─────────────────────────────────┤
│                  ┌──────────────┐│
│                  │ Notification ││
│                  │   Popup      ││
│                  └──────────────┘│
│                                  │
│                                  │
│  Restaurant Website              │
│  (Menu content here)             │
│                                  │
│                                  │
│                                  │
└─────────────────────────────────┘

Why top-right?
• Visible but not blocking content
• Standard notification area
• Easy to dismiss
• Clear visual hierarchy
```

### Extension Popup Flow

```
User clicks extension icon
         │
         ▼
┌─────────────────────┐
│ Popup opens         │
│ • Current page URL  │
│ • Monitor button    │
│ • Recent changes    │
└──────┬──────────────┘
       │
       ├─→ Click "Analyze" → Shows menu analysis
       │
       ├─→ Click "Monitor" → Activates observer
       │
       └─→ Click "Settings" → Opens options page
```

## 📊 State Management

### Extension State

```
Storage (Chrome local):
{
  settings: {
    autoMonitor: false,
    debounceDelay: 2000,
    checkCooldown: 30000
  },

  monitoredSites: {
    "restaurant1.com": {
      lastSnapshot: {...},
      lastChecked: 1234567890,
      changeCount: 5
    }
  },

  changeHistory: [
    {
      url: "restaurant1.com",
      timestamp: 1234567890,
      changes: {...}
    }
  ]
}
```

### Runtime State (Content Script)

```javascript
{
  isMonitoring: true,
  mutationObserver: MutationObserver{...},
  debounceTimer: setTimeout{...},
  lastCheckTime: 1234567890,
  initialMenuSnapshot: {...},
  changeBuffer: [mutation, mutation, ...]
}
```

## 🔌 Extension Permissions

```
Required Permissions:
┌────────────────────────┐
│ storage                │ → Save settings & history
│ activeTab              │ → Access current tab
│ tabs                   │ → Check which tab is active
│ scripting              │ → Inject content script
│ notifications          │ → Show change alerts
│ alarms                 │ → Scheduled checks (optional)
│ <all_urls>             │ → Work on any website
└────────────────────────┘
```

## 🚀 Deployment Architecture

```
Development:
[Local Files] → Load unpacked → Chrome

Production Option 1 (Manual):
[ZIP file] → Share with users → Manual install

Production Option 2 (Web Store):
[Package] → Submit → Chrome review → Published
                     ↓
              [Install link] → One-click install

Production Option 3 (Enterprise):
[Host on server] → Enterprise policy → Auto-install
```

## 🧪 Testing Architecture

```
Test Environment:
┌────────────────────────────────────┐
│ Test Launcher (test-launcher.html) │
├────────────────────────────────────┤
│  ├─→ WordPress test                │
│  ├─→ Wix test                      │
│  └─→ GoDaddy test                  │
└────────────────────────────────────┘
         │
         ▼
Each test site has:
• Realistic menu structure
• Interactive edit buttons
• Platform-specific styling
• Simulated CMS behavior
```

## 📈 Scalability

```
Current: 1 restaurant
    ├─ 1 MutationObserver
    ├─ 1 snapshot in storage
    └─ Minimal memory

Scale: 100 restaurants
    ├─ 1 MutationObserver per tab
    ├─ 100 snapshots in storage (~5MB)
    └─ Still minimal memory

Scale: 1000+ restaurants
    ├─ Background worker handles all
    ├─ Storage auto-cleanup (keep last 100)
    └─ Chrome manages resources
```

---

This architecture enables:
- ✅ Universal compatibility
- ✅ Real-time detection
- ✅ Minimal resource usage
- ✅ Scalable to unlimited restaurants
- ✅ Privacy-focused design
- ✅ Simple deployment
