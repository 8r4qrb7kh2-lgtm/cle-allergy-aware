#!/usr/bin/env node

// Test script to verify Perplexity API is being called
// This simulates what the frontend does

const SUPABASE_URL = 'https://fgoiyycctnwnghrvsilt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb2l5eWNjdG53bmdocnZzaWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MzY1MjYsImV4cCI6MjA3NjAxMjUyNn0.xlSSXr0Gl7j-vsckrj-2anpPmp4BG2SUIdN-_dquSA8';

async function testPerplexityAPI() {
  console.log('🧪 Testing Perplexity API call...\n');
  
  const requestBody = {
    productName: 'Bold Elote Mexican-Style Street Corn Flavored Almonds',
    brand: 'Blue Diamond',
    barcode: '041570147016',
    provider: 'perplexity',
    openFoodFactsData: null
  };
  
  console.log('📤 Request:');
  console.log(JSON.stringify(requestBody, null, 2));
  console.log('\n⏳ Calling Supabase function...\n');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/verify-brand-sources`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log(`📥 Response Status: ${response.status} ${response.statusText}\n`);
    
    const result = await response.json();
    
    console.log('📊 Response Data:');
    console.log(JSON.stringify(result, null, 2));
    
    console.log('\n\n=== ANALYSIS ===');
    
    if (result.error) {
      console.log('❌ Error:', result.error);
    }
    
    if (result.sourcesFound !== undefined) {
      console.log(`\n📈 Sources Found: ${result.sourcesFound}/${result.minimumSourcesRequired}`);
      
      if (result.sources && result.sources.length > 0) {
        console.log('\n📋 Sources:');
        result.sources.forEach((source, idx) => {
          console.log(`  ${idx + 1}. ${source.name}`);
          console.log(`     URL: ${source.url}`);
          console.log(`     Ingredients: ${source.ingredientsText.substring(0, 50)}...`);
          console.log(`     Confidence: ${source.confidence}%`);
        });
      }
    }
    
    console.log('\n\n=== NEXT STEPS ===');
    console.log('Check Supabase logs at:');
    console.log('https://supabase.com/dashboard/project/fgoiyycctnwnghrvsilt/logs/edge-functions');
    console.log('\nLook for these indicators:');
    console.log('  🎯 [ROUTER] Provider requested: perplexity');
    console.log('  ✅ [ROUTER] Using Perplexity');
    console.log('  🔍 [PERPLEXITY] Searching Amazon...');
    console.log('  📡 [PERPLEXITY] Making API call...');
    console.log('  📥 [PERPLEXITY] API response status: 200');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

testPerplexityAPI();

