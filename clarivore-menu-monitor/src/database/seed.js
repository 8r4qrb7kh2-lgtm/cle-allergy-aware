const { query } = require('./db');
require('dotenv').config();

/**
 * Database seeding script
 * Adds sample restaurants for testing
 */
async function seed() {
  try {
    console.log('Starting database seeding...');

    // Sample restaurants
    const restaurants = [
      {
        name: 'Bella Italia Ristorante',
        websiteUrl: 'https://example.com/bella-italia',
        menuPageUrl: 'https://example.com/bella-italia/menu',
        managerEmail: 'manager@bellaitalia.com',
        managerName: 'Maria Rossi',
        checkFrequency: 'hourly'
      },
      {
        name: 'Sakura Sushi & Grill',
        websiteUrl: 'https://example.com/sakura',
        menuPageUrl: 'https://example.com/sakura/menu',
        managerEmail: 'chef@sakurasushi.com',
        managerName: 'Kenji Tanaka',
        checkFrequency: 'daily'
      },
      {
        name: 'The Green Leaf Cafe',
        websiteUrl: 'https://example.com/greenleaf',
        menuPageUrl: 'https://example.com/greenleaf/menu',
        managerEmail: 'info@greenleafcafe.com',
        managerName: 'Emma Thompson',
        checkFrequency: 'hourly'
      },
      {
        name: 'La Taqueria Mexicana',
        websiteUrl: 'https://example.com/taqueria',
        menuPageUrl: 'https://example.com/taqueria/menu',
        managerEmail: 'contact@lataqueria.com',
        managerName: 'Carlos Martinez',
        checkFrequency: 'daily'
      }
    ];

    console.log(`\nInserting ${restaurants.length} sample restaurants...`);

    for (const restaurant of restaurants) {
      const result = await query(
        `INSERT INTO restaurants
         (name, website_url, menu_page_url, manager_email, manager_name, check_frequency, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT DO NOTHING
         RETURNING id, name`,
        [
          restaurant.name,
          restaurant.websiteUrl,
          restaurant.menuPageUrl,
          restaurant.managerEmail,
          restaurant.managerName,
          restaurant.checkFrequency
        ]
      );

      if (result.rows.length > 0) {
        console.log(`  ✓ Added: ${result.rows[0].name} (ID: ${result.rows[0].id})`);
      } else {
        console.log(`  - Skipped: ${restaurant.name} (already exists)`);
      }
    }

    console.log('\n✅ Seeding completed successfully!');
    console.log('\nYou can now:');
    console.log('  - Start the API server: npm run dev');
    console.log('  - Test monitoring: POST /api/monitoring/check/:restaurantId');
    console.log('  - View restaurants: GET /api/restaurants');

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run seeding if called directly
if (require.main === module) {
  seed();
}

module.exports = seed;
