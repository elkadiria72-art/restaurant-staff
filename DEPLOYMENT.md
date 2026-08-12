# Deployment & Configuration Guide

## Pre-Deployment Checklist

### 1. Database Setup ✅

Ensure both tables exist in Supabase:

```sql
-- Table 1: Orders
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  table_number INT NOT NULL,
  table_id VARCHAR(255),
  items JSONB NOT NULL DEFAULT '[]',
  total_price DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_table_number ON orders(table_number);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Table 2: Waiter Calls (NEW)
CREATE TABLE IF NOT EXISTS waiter_calls (
  id BIGSERIAL PRIMARY KEY,
  table_number INT NOT NULL,
  table_id VARCHAR(255),
  message VARCHAR(500),
  request_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waiter_calls_table_number ON waiter_calls(table_number);
CREATE INDEX IF NOT EXISTS idx_waiter_calls_table_id ON waiter_calls(table_id);
CREATE INDEX IF NOT EXISTS idx_waiter_calls_status ON waiter_calls(status);
```

### 2. Enable Realtime

In Supabase Dashboard → Database → Replication:

1. Select `public` schema
2. Toggle ON for `orders` table
   - ✓ INSERT
   - ✓ UPDATE
   - ✓ DELETE
3. Toggle ON for `waiter_calls` table
   - ✓ INSERT
   - ✓ UPDATE
   - ✓ DELETE

### 3. Environment Variables ✅

Create `.env.local` (or update `.env`):

```bash
# Required: Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://yyfcedfeicoqqawpkddw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_Pj3HMkQTeoQ9pbEaAW7AqQ_2YdtcZ5R

# Optional: Add for production
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NODE_ENV=production
```

### 4. Audio Files ✅

Verify sound files exist:
```bash
ls -la public/sound-ousis/
# Expected output:
# Sonner.mp3      (for order alerts)
# Sonner2.mp3     (for waiter calls)
```

If missing, you can:
- Add your own MP3 files
- The system will fall back to Web Audio API synthesis

---

## Local Development

### Installation

```bash
cd e:/ouasis-staff
npm install
npm run dev
```

Access:
- Menu: http://localhost:3000/menu
- Staff: http://localhost:3000/staff

### Testing the Full Flow

**Terminal 1 (Customer):**
```
1. Open http://localhost:3000/menu
2. Enter table number: 5
3. Add items to cart
4. Click "استدعاء النادل" (Call Waiter)
```

**Terminal 2 (Staff):**
```
1. Open http://localhost:3000/staff
2. You should see:
   - Alert modal appears
   - Banner appears at top
   - Sound plays (if enabled)
   - Table number = 5
```

---

## Production Deployment

### Option 1: Vercel (Recommended)

```bash
# 1. Push to GitHub
git add .
git commit -m "Add waiter call system"
git push

# 2. Connect to Vercel
# Go to https://vercel.com and import your repository

# 3. Set environment variables in Vercel dashboard
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY

# 4. Deploy
npm run build
vercel deploy --prod
```

### Option 2: Docker

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Deploy:
```bash
docker build -t elkahmed-restaurant .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=https://... \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_... \
  elkahmed-restaurant
```

### Option 3: Traditional VPS

```bash
# On your VPS
ssh user@your-vps.com

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone repository
git clone https://github.com/your-repo/elkahmed.git
cd elkahmed

# Install and build
npm install
npm run build

# Start with PM2
npm install -g pm2
pm2 start "npm start" --name "elkahmed"
pm2 save
pm2 startup

# Set up nginx reverse proxy
sudo apt-get install nginx
sudo nano /etc/nginx/sites-available/default
```

nginx configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Security Configuration

### 1. Enable Authentication (Recommended)

Add Supabase Auth to `/app/staff/page.tsx`:

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function StaffPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      setAuthorized(true);
    };

    checkAuth();
  }, [router]);

  if (!authorized) return <div>Loading...</div>;

  // ... rest of component
}
```

### 2. Row Level Security (RLS)

Enable RLS in Supabase for `waiter_calls`:

```sql
-- Enable RLS
ALTER TABLE waiter_calls ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert calls (from customer side)
CREATE POLICY "anyone_can_insert" ON waiter_calls
  FOR INSERT
  WITH CHECK (true);

-- Allow staff to view and update
CREATE POLICY "staff_can_view" ON waiter_calls
  FOR SELECT
  USING (true);

CREATE POLICY "staff_can_update" ON waiter_calls
  FOR UPDATE
  USING (true);
```

### 3. Rate Limiting

Add to customer menu to prevent spam:

```typescript
const [lastCallTime, setLastCallTime] = useState(0);

const handleCallWaiter = async () => {
  const now = Date.now();
  
  // Prevent more than 1 call per 30 seconds
  if (now - lastCallTime < 30000) {
    setError('يرجى الانتظار قبل استدعاء النادل مرة أخرى');
    return;
  }

  setLastCallTime(now);
  
  // ... rest of function
};
```

---

## Monitoring & Maintenance

### 1. Monitor Realtime Connections

Add to staff page for diagnostics:

```typescript
useEffect(() => {
  const interval = setInterval(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    // Log connection status
    console.log('Realtime connection active');
  }, 30000);

  return () => clearInterval(interval);
}, []);
```

### 2. Log Alerts

Create audit table:

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(50),
  table_number INT,
  data JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Log events:
```typescript
const logEvent = async (eventType: string, data: any) => {
  await supabase
    .from('audit_log')
    .insert([{ event_type: eventType, data }]);
};
```

### 3. Monitor Performance

```bash
# Enable performance monitoring
npm install web-vitals

# In your page:
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

---

## Troubleshooting Deployment

### Issue: "Cannot find Supabase URL"

**Solution:**
```bash
# Check .env file exists
cat .env

# Verify NEXT_PUBLIC_ prefix
echo $NEXT_PUBLIC_SUPABASE_URL

# Rebuild
npm run build
npm start
```

### Issue: Realtime Not Working

**Solution:**
1. Check Supabase Dashboard → Database → Replication
2. Verify tables have replication enabled
3. Check browser console for connection errors
4. Verify WebSocket is not blocked by firewall

### Issue: Audio Not Playing in Production

**Solution:**
```bash
# Verify sound files are accessible
curl https://yourdomain.com/sound-ousis/Sonner2.mp3

# Check audio files are in build
ls -la .next/static/public/sound-ousis/

# If missing, copy manually
cp -r public/sound-ousis .next/static/public/
```

### Issue: High Latency on Realtime Updates

**Solution:**
1. Check database indexes are created
2. Optimize Supabase region (should be closest to users)
3. Use CDN for static assets
4. Consider database query optimization

---

## Scaling Considerations

### For 10+ Tables:
- ✓ Current setup handles well
- No changes needed

### For 50+ Tables:
- Add caching layer (Redis)
- Paginate order display
- Archive old waiter_calls (>1 week)

### For 100+ Tables:
- Separate staff dashboards by zone
- Implement table grouping
- Use message queues for alerts

---

## Backup & Recovery

### Daily Backups

```bash
# Supabase automatically backs up
# But you can also export manually:

# Export via Supabase CLI
supabase db push  # Backup schema
supabase db dump -f backup.sql

# Restore if needed
supabase db reset
supabase db pull < backup.sql
```

### Disaster Recovery

```bash
# In case of emergency:
1. Switch to backup Supabase project
2. Update .env to point to backup
3. Redeploy
4. Verify realtime works
5. Test waiter call system
```

---

## Certificate & SSL/TLS

### For Vercel
- Automatically handles SSL
- Certificate automatically renewed

### For Custom Domain
```bash
# Using Certbot with Let's Encrypt
sudo certbot certonly --nginx -d yourdomain.com

# Nginx automatically redirects to HTTPS
```

---

## Performance Optimization

### 1. Image Optimization
```typescript
import Image from 'next/image';

// Instead of <img>
<Image
  src="/menu-item.jpg"
  alt="description"
  width={300}
  height={200}
  priority={false}
/>
```

### 2. Bundle Analysis
```bash
npm install --save-dev @next/bundle-analyzer

# In next.config.js:
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({})

# Run analysis:
ANALYZE=true npm run build
```

### 3. Database Query Optimization
```sql
-- Add indexes on frequently queried columns
CREATE INDEX idx_waiter_calls_status_created ON waiter_calls(status, created_at DESC);
CREATE INDEX idx_orders_status_table_number ON orders(status, table_number);
```

---

## Final Deployment Checklist

- [ ] Database tables created with indexes
- [ ] Realtime enabled for both tables
- [ ] Environment variables configured
- [ ] Sound files accessible
- [ ] Build succeeds: `npm run build`
- [ ] Local testing passes
- [ ] Authentication implemented (if required)
- [ ] RLS policies configured
- [ ] SSL certificate installed
- [ ] Backups configured
- [ ] Monitoring set up
- [ ] Documentation reviewed
- [ ] Team trained on system
- [ ] Launch date scheduled
- [ ] Support procedures documented

---

## Launch Checklist - Day Of

✅ Pre-deployment:
1. Final backup of production database
2. Test waiter calls on production
3. Test audio on production
4. Brief staff on new system

✅ During deployment:
1. Monitor error logs
2. Check Supabase dashboard
3. Test from customer perspective
4. Test from staff perspective

✅ Post-deployment:
1. Gather feedback from staff
2. Monitor performance metrics
3. Be ready to rollback if needed
4. Document any issues

---

## Support & Maintenance Schedule

**Daily:**
- Monitor error logs
- Verify realtime connection status

**Weekly:**
- Test full waiter call flow
- Review performance metrics
- Check database size

**Monthly:**
- Database maintenance (vacuum, analyze)
- Security updates
- Feature improvements

**Quarterly:**
- Performance optimization review
- Backup restoration test
- Security audit

---

This deployment guide covers everything from local development to production scaling. Your system is ready to go! 🚀
