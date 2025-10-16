// Quick script to check what restaurants are in the database
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://fgoiyycctnwnghrvsilt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb2l5eWNjdG53bmdocnZzaWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MzY1MjYsImV4cCI6MjA3NjAxMjUyNn0.xlSSXr0Gl7j-vsckrj-2anpPmp4BG2SUIdN-_dquSA8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkDatabase() {
  console.log('Checking restaurants in database...\n');
  
  const { data, error } = await supabase
    .from('restaurants')
    .select('*');
  
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  
  if (!data || data.length === 0) {
    console.log('No restaurants found in database!');
    console.log('\nYou need to add restaurants to your Supabase database.');
    return;
  }
  
  console.log(`Found ${data.length} restaurant(s):\n`);
  data.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name}`);
    console.log(`   Slug: ${r.slug}`);
    console.log(`   Menu Image: ${r.menu_image ? 'Yes' : 'No'}`);
    console.log(`   Overlays: ${r.overlays ? JSON.stringify(r.overlays).substring(0, 50) + '...' : 'None'}`);
    console.log('');
  });
  
  console.log('\nTo test locally, visit:');
  data.forEach((r) => {
    console.log(`http://127.0.0.1:8080/restaurant.html?slug=${r.slug}`);
  });
}

checkDatabase().then(() => process.exit(0));
