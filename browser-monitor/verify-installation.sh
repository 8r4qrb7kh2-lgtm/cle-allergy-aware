#!/bin/bash

# Menu Change Monitor - Installation Verification Script
# This script checks if all required files are present

echo "======================================"
echo "Menu Change Monitor"
echo "Installation Verification"
echo "======================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Checking directory: $SCRIPT_DIR"
echo ""

# Required files
core_files=(
  "manifest.json"
  "config.js"
  "content.js"
  "background.js"
  "popup.html"
  "popup.js"
)

icon_files=(
  "icons/icon16.png"
  "icons/icon48.png"
  "icons/icon128.png"
)

test_files=(
  "test-pages/godaddy-style-menu.html"
  "test-pages/wix-style-menu.html"
  "test-pages/wordpress-style-menu.html"
)

doc_files=(
  "README.md"
  "TESTING.md"
  "INSTALLATION.md"
)

all_present=true

# Check core files
echo "📦 Core Extension Files:"
for file in "${core_files[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $file"
  else
    echo -e "${RED}✗${NC} MISSING: $file"
    all_present=false
  fi
done

echo ""

# Check icon files
echo "🎨 Icon Files:"
for file in "${icon_files[@]}"; do
  if [ -f "$file" ]; then
    size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    echo -e "${GREEN}✓${NC} $file (${size} bytes)"
  else
    echo -e "${RED}✗${NC} MISSING: $file"
    all_present=false
  fi
done

echo ""

# Check test files
echo "🧪 Test Pages:"
for file in "${test_files[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $file"
  else
    echo -e "${RED}✗${NC} MISSING: $file"
    all_present=false
  fi
done

echo ""

# Check documentation
echo "📚 Documentation:"
for file in "${doc_files[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $file"
  else
    echo -e "${YELLOW}⚠${NC} Optional: $file"
  fi
done

echo ""
echo "======================================"

if $all_present; then
  echo -e "${GREEN}✅ All required files present!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Open Chrome and go to chrome://extensions/"
  echo "2. Enable 'Developer mode' (top right)"
  echo "3. Click 'Load unpacked'"
  echo "4. Select this folder: $SCRIPT_DIR"
  echo "5. Configure the extension with your Claude API key"
  echo ""
  echo "See INSTALLATION.md for detailed setup instructions."
else
  echo -e "${RED}❌ Some required files are missing!${NC}"
  echo ""
  echo "Please ensure all files are present before loading the extension."
  echo "Check that you've extracted all files from the archive."
fi

echo "======================================"

# Check if manifest.json is valid JSON
if [ -f "manifest.json" ]; then
  echo ""
  echo "Validating manifest.json..."
  if command -v python3 &> /dev/null; then
    if python3 -m json.tool manifest.json > /dev/null 2>&1; then
      echo -e "${GREEN}✓${NC} manifest.json is valid JSON"
    else
      echo -e "${RED}✗${NC} manifest.json has JSON syntax errors!"
      all_present=false
    fi
  else
    echo -e "${YELLOW}⚠${NC} Python3 not found, skipping JSON validation"
  fi
fi

# Create a test file paths list
echo ""
echo "Test page URLs (for copy-paste into browser):"
echo "1. file://$SCRIPT_DIR/test-pages/godaddy-style-menu.html"
echo "2. file://$SCRIPT_DIR/test-pages/wix-style-menu.html"
echo "3. file://$SCRIPT_DIR/test-pages/wordpress-style-menu.html"

echo ""
