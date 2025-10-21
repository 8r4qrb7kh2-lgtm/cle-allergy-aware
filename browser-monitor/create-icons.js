// Simple script to create placeholder PNG icons
// We'll create base64 data URLs that can be used temporarily

const fs = require('fs');

// Create a simple canvas-like structure (we'll use SVG converted to data URL)
const createIcon = (size) => {
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad${size}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#grad${size})" rx="${size/5}"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size/3}" fill="none" stroke="white" stroke-width="${size/20}"/>
  <line x1="${size/2.8}" y1="${size/3.6}" x2="${size/2.8}" y2="${size/1.8}" stroke="white" stroke-width="${size/30}"/>
  <line x1="${size/3.2}" y1="${size/3.6}" x2="${size/3.2}" y2="${size/2.8}" stroke="white" stroke-width="${size/40}"/>
  <line x1="${size/2.5}" y1="${size/3.6}" x2="${size/2.5}" y2="${size/2.8}" stroke="white" stroke-width="${size/40}"/>
  <line x1="${size/1.5}" y1="${size/3.6}" x2="${size/1.5}" y2="${size/1.8}" stroke="white" stroke-width="${size/30}"/>
  <path d="M ${size/1.7} ${size/3.6} L ${size/1.4} ${size/3.6} L ${size/1.5} ${size/2.8} Z" fill="white"/>
</svg>`;
};

// Create icons directory
if (!fs.existsSync('icons')) {
  fs.mkdirSync('icons');
}

// Save SVG files (Chrome can use SVG icons in some cases)
fs.writeFileSync('icons/icon16.svg', createIcon(16));
fs.writeFileSync('icons/icon48.svg', createIcon(48));
fs.writeFileSync('icons/icon128.svg', createIcon(128));

console.log('SVG icons created. For proper PNG icons, please:');
console.log('1. Visit https://cloudconvert.com/svg-to-png');
console.log('2. Convert icons/icon.svg to PNG at sizes 16x16, 48x48, and 128x128');
console.log('3. Or use ImageMagick: convert icon.svg -resize WxH iconN.png');

// For now, let's also create a simple HTML file to generate icons
const htmlGenerator = `<!DOCTYPE html>
<html>
<head><title>Icon Generator</title></head>
<body>
<canvas id="c16" width="16" height="16"></canvas>
<canvas id="c48" width="48" height="48"></canvas>
<canvas id="c128" width="128" height="128"></canvas>
<script>
function drawIcon(canvas) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  
  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#667eea');
  grad.addColorStop(1, '#764ba2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  
  // White circle (plate)
  ctx.strokeStyle = 'white';
  ctx.lineWidth = size / 20;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/3, 0, Math.PI * 2);
  ctx.stroke();
  
  // Fork
  ctx.lineWidth = size / 30;
  ctx.beginPath();
  ctx.moveTo(size/2.8, size/3.6);
  ctx.lineTo(size/2.8, size/1.8);
  ctx.stroke();
  
  // Knife
  ctx.beginPath();
  ctx.moveTo(size/1.5, size/3.6);
  ctx.lineTo(size/1.5, size/1.8);
  ctx.stroke();
}

['c16', 'c48', 'c128'].forEach(id => {
  drawIcon(document.getElementById(id));
});

// Download function
setTimeout(() => {
  ['c16', 'c48', 'c128'].forEach(id => {
    const canvas = document.getElementById(id);
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'icon' + canvas.width + '.png';
    a.click();
  });
}, 500);
</script>
<p>Icons should download automatically. If not, right-click each canvas and save as PNG.</p>
</body>
</html>`;

fs.writeFileSync('icons/generator.html', htmlGenerator);
console.log('Created icons/generator.html - open in browser to generate PNG icons');

