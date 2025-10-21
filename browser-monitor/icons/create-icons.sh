#!/bin/bash
# Script to create placeholder icons using ImageMagick or Python PIL
# For now, we'll create simple SVG icons that can be converted

cat > icon.svg << 'EOF'
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" fill="#667eea" rx="20"/>
  <text x="64" y="90" font-size="80" text-anchor="middle" fill="white">🍽️</text>
</svg>
EOF

echo "Icon template created. You can use online SVG to PNG converters or ImageMagick to create the PNGs:"
echo "convert icon.svg -resize 16x16 icon16.png"
echo "convert icon.svg -resize 48x48 icon48.png"
echo "convert icon.svg -resize 128x128 icon128.png"
