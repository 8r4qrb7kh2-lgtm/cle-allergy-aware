# SendGrid Email Configuration - Fix Spam Issue

## What I've Already Done For You

✅ **Updated the code** to use `noreply@clarivore.org` as the sender email instead of `clarivoretesting@gmail.com`
✅ **Deployed the fix** to Supabase - the new code is live
✅ **Set up automatic monitoring** using GitHub Actions (runs every 6 hours)

## What You Need To Do (5-10 minutes)

Your emails are going to spam because Gmail detects that `clarivoretesting@gmail.com` is being sent from SendGrid servers (not Gmail servers), which looks like spoofing. To fix this, you need to verify `noreply@clarivore.org` in SendGrid.

### Option 1: Quick Single Sender Verification (Recommended - 5 minutes)

This is the fastest way to get your emails out of spam:

1. **Go to SendGrid**: https://app.sendgrid.com/settings/sender_auth/senders

2. **Click "Create New Sender"** (blue button on the right)

3. **Fill in the form**:
   - **From Name**: `Clarivore Menu Monitor`
   - **From Email Address**: `noreply@clarivore.org`
   - **Reply To**: `clarivoretesting@gmail.com`
   - **Company Address**: (Your address)
   - **City**: (Your city)
   - **State**: (Your state)
   - **Zip**: (Your zip)
   - **Country**: United States

4. **Click "Save"**

5. **Check your email** (clarivoretesting@gmail.com) for a verification email from SendGrid

6. **Click the verification link** in that email

7. **Done!** Your emails will now go to inbox instead of spam

### Option 2: Domain Authentication (Better Long-Term - 15-20 minutes)

If you want the best email deliverability, authenticate your entire domain:

1. **Go to SendGrid Domain Authentication**: https://app.sendgrid.com/settings/sender_auth

2. **Click "Authenticate Your Domain"**

3. **Enter your domain**: `clarivore.org`

4. **SendGrid will generate DNS records** (3 CNAME records)

5. **Add these DNS records** to wherever clarivore.org's DNS is hosted:
   - If you use **Vercel**: Go to your Vercel project → Settings → Domains → Add DNS records
   - If you use **GoDaddy**: Go to DNS Management and add the CNAME records
   - If you use **Cloudflare**: Go to DNS settings and add the records

6. **Wait 5-30 minutes** for DNS to propagate

7. **Go back to SendGrid** and click "Verify"

8. **Done!** Your domain is now authenticated

## Why This Fixes The Problem

- **Before**: Emails from `clarivoretesting@gmail.com` → Gmail says "This isn't really from Gmail!" → SPAM
- **After**: Emails from `noreply@clarivore.org` → SendGrid proves you own clarivore.org → INBOX

## Testing After Setup

Once you've verified the sender, you can test it:

1. Go to your GitHub repository: https://github.com/8r4qrb7kh2-lgtm/cle-allergy-aware
2. Click **Actions** tab
3. Click **Monitor Restaurant Menus** workflow
4. Click **Run workflow** button
5. Wait 2-3 minutes
6. Check `clarivoretesting@gmail.com` inbox (not spam!) for the notification

## Need Help?

If you run into any issues:
- SendGrid support docs: https://docs.sendgrid.com/ui/account-and-settings/how-to-set-up-domain-authentication
- Or message me with a screenshot of where you're stuck
