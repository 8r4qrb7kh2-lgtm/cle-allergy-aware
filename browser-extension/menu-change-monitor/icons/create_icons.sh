#!/bin/bash

# Create simple text-based icons (these should be replaced with proper icons)
# For now, create colored square placeholders

# 16x16 icon
cat > icon16.svg << 'SVGEOF'
<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
  <rect width="16" height="16" fill="#667eea"/>
  <text x="8" y="12" font-family="Arial" font-size="12" fill="white" text-anchor="middle">AI</text>
</svg>
SVGEOF

# 48x48 icon
cat > icon48.svg << 'SVGEOF'
<svg width="48" height="48" xmlns="http://www.w3.org/2000/svg">
  <rect width="48" height="48" rx="8" fill="#667eea"/>
  <text x="24" y="32" font-family="Arial" font-size="24" font-weight="bold" fill="white" text-anchor="middle">AI</text>
</svg>
SVGEOF

# 128x128 icon
cat > icon128.svg << 'SVGEOF'
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="16" fill="url(#grad)"/>
  <text x="64" y="85" font-family="Arial, sans-serif" font-size="60" font-weight="bold" fill="white" text-anchor="middle">AI</text>
  <text x="64" y="105" font-family="Arial, sans-serif" font-size="12" fill="white" text-anchor="middle" opacity="0.8">MENU</text>
</svg>
SVGEOF

echo "SVG icons created. Convert to PNG if needed."
