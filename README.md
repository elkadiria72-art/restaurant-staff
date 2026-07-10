# Staff Dashboard

A mobile-friendly Next.js staff dashboard for restaurant orders with real-time Supabase updates.

## Setup

1. Copy .env.example to .env.local and fill in your Supabase credentials.
2. Make sure your Supabase project has an orders table with at least these columns:
   - id (uuid, primary key)
   - table_number (int)
   - items (jsonb)
   - total_price (numeric)
   - status (text)
   - created_at (timestamp)
3. Install dependencies: npm install
4. Start the app: npm run dev

## Features

- Real-time order listening via Supabase Realtime
- Pending / In Progress / Served status updates
- Large touch-friendly buttons for kitchen staff
- Responsive card-based layout for tablets and phones
