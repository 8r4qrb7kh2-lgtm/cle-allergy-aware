#!/bin/bash

# Deployment script for Perplexity multi-source fix
# This script deploys the updated verify-brand-sources function to Supabase

set -e  # Exit on error

echo "=========================================="
echo "Deploying Perplexity Multi-Source Fix"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -d "supabase/functions/verify-brand-sources" ]; then
    echo "❌ Error: Must run from project root directory"
    echo "   Current directory: $(pwd)"
    exit 1
fi

echo "✓ Found verify-brand-sources function"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI not installed"
    echo "   Install with: npm install -g supabase"
    exit 1
fi

echo "✓ Supabase CLI installed"
echo ""

# Check if logged in or has access token
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "⚠️  SUPABASE_ACCESS_TOKEN not set"
    echo "   Attempting to use existing login..."
    echo ""
    
    # Try to list projects to check if logged in
    if ! supabase projects list &> /dev/null; then
        echo "❌ Not logged in to Supabase"
        echo ""
        echo "Please login first:"
        echo "  Option 1: Run 'supabase login' in your terminal"
        echo "  Option 2: Set SUPABASE_ACCESS_TOKEN environment variable"
        echo ""
        echo "To get an access token:"
        echo "  1. Go to https://app.supabase.com/account/tokens"
        echo "  2. Create a new token"
        echo "  3. Export it: export SUPABASE_ACCESS_TOKEN='your-token-here'"
        exit 1
    fi
fi

echo "✓ Authenticated with Supabase"
echo ""

# Deploy the function
echo "Deploying verify-brand-sources function..."
echo ""

supabase functions deploy verify-brand-sources

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ Deployment Successful!"
    echo "=========================================="
    echo ""
    echo "The Perplexity multi-source fix has been deployed."
    echo ""
    echo "Next steps:"
    echo "  1. Test the function with provider: 'perplexity'"
    echo "  2. Check logs: supabase functions logs verify-brand-sources --follow"
    echo "  3. Verify multiple sources are returned"
    echo ""
    echo "Test command:"
    echo "  curl -X POST 'https://fgoiyycctnwnghrvsilt.supabase.co/functions/v1/verify-brand-sources' \\"
    echo "    -H 'Authorization: Bearer YOUR_ANON_KEY' \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"productName\":\"Pita Chips\",\"brand\":\"Stacys\",\"barcode\":\"028400064316\",\"provider\":\"perplexity\"}'"
    echo ""
else
    echo ""
    echo "=========================================="
    echo "❌ Deployment Failed"
    echo "=========================================="
    echo ""
    echo "Please check the error messages above."
    echo ""
    echo "Common issues:"
    echo "  - Not logged in (run 'supabase login')"
    echo "  - Wrong project linked (run 'supabase link --project-ref fgoiyycctnwnghrvsilt')"
    echo "  - Network issues"
    echo ""
    exit 1
fi

