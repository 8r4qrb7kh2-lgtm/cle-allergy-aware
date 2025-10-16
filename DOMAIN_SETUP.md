# Domain Configuration Guide

## Current Issue
- cleallergyaware.com is redirecting instead of connecting to production
- DNS records in Wix are pointing to wrong IPs

## Fix Steps

### 1. Vercel Configuration

**For cleallergyaware.com:**
1. Go to Vercel Project Settings → Domains
2. Click "Edit" on `cleallergyaware.com`
3. Select "Connect to an environment" (not "Redirect")
4. Choose "Production"
5. Click "Save"

**For www.cleallergyaware.com:**
1. Should already be set to "Connect to an environment → Production"
2. If not, set it up the same way

### 2. Wix DNS Configuration

**Option A: Using Vercel's Nameservers (Recommended)**
1. In Vercel, go to your domain settings
2. Get the nameserver addresses (usually ns1.vercel-dns.com and ns2.vercel-dns.com)
3. In Wix, change the nameservers to Vercel's nameservers
4. Wait 24-48 hours for DNS propagation

**Option B: Using Wix DNS with CNAME/A records**

Delete existing incorrect records:
- Delete A record: `cle-allergy-aw...` → `216.198.79.1`

Add these records:
1. **For root domain (cleallergyaware.com)**:
   - Type: `A`
   - Host: `@` or `cle-allergy-aware.com`
   - Value: `76.76.21.21`
   - TTL: 1 hour

2. **For www subdomain** (should already exist):
   - Type: `CNAME`
   - Host: `www`
   - Value: `cname.vercel-dns.com`
   - TTL: 1 hour

### 3. Verification

After making changes:
1. Wait 5-10 minutes for initial propagation
2. Test: `https://cleallergyaware.com`
3. Test: `https://www.cleallergyaware.com`
4. Both should load the site (not redirect)

### 4. SSL Certificates

Vercel will automatically provision SSL certificates once DNS is correctly configured. This may take a few minutes.

## Troubleshooting

**If domains don't work after 24 hours:**
1. Run `nslookup cleallergyaware.com` to verify DNS
2. Run `nslookup www.cleallergyaware.com` to verify DNS
3. Check Vercel dashboard for SSL certificate status
4. Check Vercel logs for any errors

**Common Issues:**
- "Invalid Configuration" in Vercel: DNS not pointing correctly
- SSL errors: Wait for Vercel to provision certificates (can take up to 24h)
- 307 Redirect loop: Make sure domain is set to "Connect to environment" not "Redirect"
