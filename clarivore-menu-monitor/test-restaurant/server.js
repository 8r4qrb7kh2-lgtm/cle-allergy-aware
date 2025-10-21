const express = require('express');
const path = require('path');

const app = express();
const PORT = 8080;

// Serve static files
app.use(express.static(__dirname));

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`🍽️  The Coastal Kitchen - Test Restaurant`);
  console.log(`========================================`);
  console.log(`\n✓ Server running at: http://localhost:${PORT}`);
  console.log(`\nThis is your test restaurant website for menu monitoring.`);
  console.log(`Open it in your browser to see the menu!\n`);
});
