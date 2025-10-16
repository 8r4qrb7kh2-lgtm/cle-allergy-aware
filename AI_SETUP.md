# AI Service Setup Instructions

The AI Ingredient Assistant is now configured! Follow these steps to deploy it:

## Prerequisites

1. **Supabase CLI** - Install if you haven't already:
   ```bash
   npm install -g supabase
   ```

2. **OpenAI API Key** - Get one from: https://platform.openai.com/api-keys
   - Sign up or log in to OpenAI
   - Navigate to API Keys section
   - Create a new secret key
   - Copy and save it securely (you won't be able to see it again)

## Deployment Steps

### Step 1: Link Your Supabase Project

```bash
supabase login
supabase link --project-ref fgoiyycctnwnghrvsilt
```

### Step 2: Set Your OpenAI API Key

```bash
supabase secrets set OPENAI_API_KEY=your_actual_openai_api_key_here
```

Replace `your_actual_openai_api_key_here` with your real OpenAI API key.

### Step 3: Deploy the Edge Function

```bash
supabase functions deploy ai-ingredient-assistant
```

### Step 4: Verify Deployment

After deployment, you should see a success message with the function URL. You can test it:

```bash
supabase functions invoke ai-ingredient-assistant --body '{"text":"chicken marinated in yogurt, lemon juice, garlic","dishName":"Grilled Chicken"}'
```

## Testing Locally (Optional)

If you want to test the function locally before deploying:

1. Create a local `.env` file in the `supabase` directory:
   ```bash
   cp supabase/.env.example supabase/.env
   ```

2. Edit `supabase/.env` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_actual_openai_api_key_here
   ```

3. Start Supabase locally:
   ```bash
   supabase start
   supabase functions serve ai-ingredient-assistant --env-file supabase/.env
   ```

4. Test the local function:
   ```bash
   curl -i --location --request POST 'http://localhost:54321/functions/v1/ai-ingredient-assistant' \
     --header 'Content-Type: application/json' \
     --data '{"text":"chicken marinated in yogurt, lemon juice, garlic","dishName":"Grilled Chicken"}'
   ```

## Troubleshooting

### "OpenAI API key not configured"
- Make sure you ran: `supabase secrets set OPENAI_API_KEY=your_key`
- Redeploy the function after setting secrets

### "Function not found"
- Verify deployment: `supabase functions list`
- Check the function name matches: `ai-ingredient-assistant`

### "Permission denied"
- Make sure you're logged in: `supabase login`
- Make sure you linked the project: `supabase link --project-ref fgoiyycctnwnghrvsilt`

## Cost Considerations

The function uses:
- **gpt-4o-mini** for text-only requests (cheaper, faster)
- **gpt-4o** for requests with images (more expensive, supports vision)

Typical costs (as of 2024):
- Text analysis: ~$0.0001-0.001 per request
- Image analysis: ~$0.001-0.01 per request

Monitor your usage at: https://platform.openai.com/usage

## What This Does

The AI service analyzes dish descriptions and/or ingredient label photos to:
1. Extract individual ingredients
2. Identify brand names (if mentioned)
3. Detect allergens: dairy, egg, peanut, tree nut, shellfish, fish, gluten, soy, sesame, wheat
4. Return structured JSON for the allergen awareness system

Once deployed, the "AI service unavailable" message will disappear and the assistant will work fully!
