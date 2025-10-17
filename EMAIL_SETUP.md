# Email Notification Setup

The system now sends email notifications when menu changes are detected. To enable this:

## 1. Sign up for Resend

1. Go to https://resend.com
2. Sign up for a free account (3,000 emails/month free)
3. Verify your email address

## 2. Get API Key

1. Go to https://resend.com/api-keys
2. Click "Create API Key"
3. Give it a name like "Clarivore Notifications"
4. Copy the API key (starts with `re_`)

## 3. Add Domain (Optional but Recommended)

For emails to come from `notifications@clarivore.org`:
1. Go to https://resend.com/domains
2. Click "Add Domain"
3. Enter `clarivore.org`
4. Follow DNS instructions to verify ownership

**OR** use their free domain:
- Emails will come from `onboarding@resend.dev`
- No setup required, works immediately

## 4. Set Supabase Secret

Run this command with your actual API key:

```bash
supabase secrets set RESEND_API_KEY=re_your_actual_api_key_here
```

## 5. Update Email Function (if using free domain)

If you're using the free `onboarding@resend.dev` domain, update the function:

Edit `supabase/functions/send-notification-email/index.ts` line with:
```typescript
from: 'Clarivore <onboarding@resend.dev>',
```

Then redeploy:
```bash
supabase functions deploy send-notification-email
```

## Testing

1. As a restaurant manager, upload a new menu image
2. If AI detects changes, you should receive an email at mattdav53@gmail.com
3. Check spam folder if you don't see it

## How It Works

When a restaurant uploads a new menu image:

1. **AI Analysis**: Menu is automatically analyzed for dishes
2. **Comparison**: New menu compared with existing overlays
3. **If Changes Detected**:
   - Email sent to mattdav53@gmail.com with details
   - Manager sees "Pending Approval" message
   - Change log notes "pending approval"
4. **If No Changes**:
   - No email sent
   - Manager sees success message
   - Update proceeds normally

## Email Content

The email includes:
- Restaurant name
- List of new items detected
- List of removed items
- Count of existing items
- Direct link to review the restaurant menu

## Troubleshooting

**Emails not sending?**
- Check `supabase secrets list` to verify RESEND_API_KEY is set
- Check Resend dashboard logs at https://resend.com/emails
- Check browser console for errors
- Verify function is deployed: `supabase functions list`

**Wrong email address?**
- Edit `supabase/functions/send-notification-email/index.ts`
- Update `ADMIN_EMAIL` constant
- Redeploy: `supabase functions deploy send-notification-email`
