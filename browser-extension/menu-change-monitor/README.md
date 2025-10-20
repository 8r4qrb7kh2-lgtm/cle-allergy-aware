# Universal Menu Change Monitor

This Chrome extension observes any website for changes that look like edits to restaurant menu content (dish names, descriptions, ingredients, etc.). When it notices an update it reminds the editor to synchronise allergen information on other platforms.

## Features

- Works on any website without prior configuration by using heuristics around menu-related keywords.
- Watches form fields, content editable regions, and other DOM mutations for add/update/remove events.
- Highlights the element that changed and shows an in-page notification reminding the editor to update allergen data elsewhere.
- Deduplicates notifications during the same editing session to avoid spamming the user.

## Installation

1. Open **chrome://extensions** in Google Chrome (or another Chromium-based browser).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**. A file picker opens:
   - **macOS / Linux** – Navigate to the folder where you cloned this repo, open `browser-extension`, single-click `menu-change-monitor`, then press **Select Folder** (Linux) or **Open** (macOS).
   - **Windows** – In the dialog, browse to your clone (for example `C:\path\to\cle-allergy-aware`), open the `browser-extension` folder, single-click `menu-change-monitor`, then choose **Select Folder**. If you only see files, switch the dialog to show **Folders** and try again.
   The extensions page should now list “Universal Menu Change Monitor”.
4. Navigate to the menu management interface of your restaurant's website. The extension will automatically watch for menu-related edits and display reminders as changes are made.

## Step-by-step validation walkthrough

Follow the checklist below to see the reminder banner trigger on a real page:

1. **Prepare a demo page** – Open any page that lets you edit menu text. If you do not have an admin site handy, create a temporary HTML file with a few dish descriptions and open it in Chrome.
2. **Confirm the script injected** – After loading the unpacked extension, refresh the page and open Chrome DevTools → **Elements**. You should see a `<div id="menu-change-monitor-toast-container">` near the end of `<body>`; this confirms the watcher is active.
3. **Make a textual change** – Edit any menu-related field (e.g. change “Grilled Salmon” to “Grilled Salmon – lemon butter”). The extension listens to `input`, `change`, `blur`, and DOM mutation events, so editing in either a form field or a `contenteditable` region will work.
4. **Watch the highlight** – As soon as you blur the edited field, it receives a temporary yellow outline indicating it triggered the monitor.
5. **Read the reminder** – A toast notification appears in the top-right reminding the editor to sync allergen information elsewhere. It auto-dismisses after 8 seconds or can be closed manually.
6. **Simulate removals and additions** – Delete a menu item or paste a new dish section. The MutationObserver emits the same reminder banner, proving the extension also watches for structural changes.

When the banner appears, you have confirmed the extension works end-to-end.

## Terminal-only quickstart

Use the following commands if you prefer to spin up a disposable demo page and launch Chrome from the terminal. Adjust the
browser path if you are on macOS or Windows.

```bash
# 1. Install dependencies (needed for the automated smoke test and static file server)
npm install

# 2. Run the automated smoke test to make sure the heuristics behave as expected
npm test

# 3. Create a throwaway demo page with a few dishes that you can edit in-place
cat <<'HTML' > /tmp/menu-monitor-demo.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Menu Monitor Demo</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; }
      .menu-item { margin-bottom: 1.5rem; }
      .menu-item h2 { margin: 0 0 0.25rem; }
      .menu-item p { margin: 0 0 0.5rem; }
      [contenteditable] { border: 1px solid #ccc; padding: 0.5rem; border-radius: 6px; }
    </style>
  </head>
  <body>
    <h1>Tonight's Menu</h1>
    <div class="menu-item">
      <h2 contenteditable="true">Grilled Salmon</h2>
      <p contenteditable="true">Fresh Atlantic salmon with lemon butter sauce.</p>
    </div>
    <div class="menu-item">
      <h2 contenteditable="true">Roasted Cauliflower</h2>
      <p contenteditable="true">Charred florets with tahini dressing and toasted almonds.</p>
    </div>
    <div class="menu-item">
      <h2 contenteditable="true">Chocolate Torte</h2>
      <p contenteditable="true">Flourless dark chocolate torte with raspberry coulis.</p>
    </div>
    <p>Edit any dish title or description, then click away to trigger the reminder banner.</p>
  </body>
</html>
HTML

# 4. Serve the page locally on http://localhost:8080/menu-monitor-demo.html
npx --yes http-server /tmp --port 8080
```

Open a second terminal while the server is running and launch Chrome with the extension already loaded:

```bash
# Linux example – replace /usr/bin/google-chrome with your Chrome/Chromium binary if different
google-chrome \
  --load-extension="$(pwd)/browser-extension/menu-change-monitor" \
  --user-data-dir="$(mktemp -d)" \
  http://localhost:8080/menu-monitor-demo.html
```

For macOS, the equivalent command is:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --load-extension="$(pwd)/browser-extension/menu-change-monitor" \
  --user-data-dir="$(mktemp -d)" \
  http://localhost:8080/menu-monitor-demo.html
```

On Windows (PowerShell):

```powershell
$repoPath = "C:\path\to\cle-allergy-aware"   # TODO: replace with the folder where you cloned this repo
$tempDir = New-Item -ItemType Directory -Path ([System.IO.Path]::GetTempPath()) -Name "menu-monitor-demo"
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList @(
  "--load-extension=$((Get-Item "$repoPath\browser-extension\menu-change-monitor").FullName)",
  "--user-data-dir=$tempDir",
  "http://localhost:8080/menu-monitor-demo.html"
)
```

Once Chrome opens, edit any of the sample dishes. The extension will highlight the field and show the reminder toast,
confirming everything works without any additional manual setup.

## Usage Notes

- The extension relies on common menu-related keywords ("menu", "dish", "ingredient", etc.) present in nearby labels, placeholders, IDs, or surrounding text. If a particular site uses very unconventional terminology, consider adding more keywords in `contentScript.js`.
- Elements can opt out of monitoring by setting a `data-menu-change-ignore="true"` attribute.
- Notifications disappear automatically after a few seconds, but you can dismiss them manually or continue editing.

## Development

The extension is a simple manifest v3 project with a single content script (`contentScript.js`). No build step is required.

To modify the heuristics or notification styling, update the content script and reload the extension from the extensions page.
