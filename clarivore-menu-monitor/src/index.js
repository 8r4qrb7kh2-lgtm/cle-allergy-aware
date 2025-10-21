require('dotenv').config();
const app = require('./api/server');
const scheduler = require('./jobs/scheduler');

const PORT = process.env.PORT || 3000;

/**
 * Main application entry point
 * Starts both API server and monitoring scheduler
 */
async function start() {
  try {
    console.log('========================================');
    console.log('🍽️  Clarivore Menu Monitor');
    console.log('========================================\n');

    // Start API server
    app.listen(PORT, () => {
      console.log(`✓ API Server running on port ${PORT}`);
      console.log(`  http://localhost:${PORT}`);
      console.log(`  http://localhost:${PORT}/health`);
    });

    // Start monitoring scheduler
    if (process.env.ENABLE_SCHEDULER !== 'false') {
      console.log('\n✓ Starting monitoring scheduler...');
      scheduler.start();
      console.log('  Scheduler is running');
    } else {
      console.log('\n⚠️  Scheduler disabled (ENABLE_SCHEDULER=false)');
    }

    console.log('\n========================================');
    console.log('System ready! 🚀');
    console.log('========================================\n');

    // Handle shutdown gracefully
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
function gracefulShutdown() {
  console.log('\n\nShutting down gracefully...');

  // Stop scheduler
  if (process.env.ENABLE_SCHEDULER !== 'false') {
    scheduler.stop();
  }

  console.log('Goodbye! 👋\n');
  process.exit(0);
}

// Start the application
if (require.main === module) {
  start();
}

module.exports = { start };
