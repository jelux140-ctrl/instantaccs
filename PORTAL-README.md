# Creed Modern Portal - Setup Guide

## Overview
The new Creed Portal features a modern, dark-themed dashboard design with:
- Clean sidebar navigation
- Particle background animation
- Card-based UI components
- Downloads section with license key management
- Support ticket system
- Responsive design

## Files Created/Modified

### Portal Site (`portal-site/`)
- `index.html` - New dashboard HTML with modern design
- `portal.css` - Complete styling with dark theme, animations, and responsive design
- `portal.js` - Full portal functionality including:
  - Login with Order ID
  - Dashboard overview with license status
  - Downloads section with loader cards
  - Support ticket system
  - License key display with copy/reveal functionality

### API Endpoints (`api/`)
- `portal-license-keys.js` - GET endpoint to fetch license keys for authenticated orders
- `admin-license-keys.js` - Admin API for managing license keys (CRUD operations)
- `admin-product-downloads.js` - Admin API for managing product download links

### Database Schema
- `portal-license-schema.sql` - New tables:
  - `license_keys` - Stores pre-generated license keys
  - `product_downloads` - Stores loader download URLs
  - `order_license_assignments` - Tracks key-to-order assignments

### Admin Panel (`admin.html`)
- Added "License Keys" tab for managing license keys
- Added modals for adding keys and managing download links
- Stats display for key inventory

## Setup Instructions

### 1. Database Setup
Run the SQL in `portal-license-schema.sql` in your Supabase SQL Editor:

```sql
-- This will create:
-- - license_keys table
-- - product_downloads table  
-- - order_license_assignments table
-- - Helper functions for auto-assigning keys
```

### 2. Environment Variables
Make sure these are set in your Vercel environment:

```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ADMIN_TOKEN=your_admin_token
```

### 3. Update Download Links
Edit `portal-site/portal.js` and update the `PRODUCT_LOADERS` object with your actual download URLs:

```javascript
const PRODUCT_LOADERS = {
    'valorant': {
        name: 'Creed Valorant',
        downloadUrl: 'https://your-actual-download-link.com/valorant-loader.zip',
        version: 'v2.1.0',
        supports: 'Windows 10/11'
    },
    // ... other products
};
```

### 4. Add License Keys
Go to Admin Panel → License Keys tab and:
1. Click "Add Keys" 
2. Enter product ID (e.g., "valorant", "fortnite")
3. Enter license keys (one per line)
4. Keys will be auto-assigned to orders when customers claim their portal access

### 5. Configure Product Downloads
In the Admin Panel → License Keys tab:
1. Click "Manage Downloads"
2. Add download URLs for each product
3. These will appear in the customer's Downloads section

## How It Works

### Customer Flow
1. Customer completes purchase → receives Order ID
2. Customer goes to portal and enters Order ID
3. System verifies order and creates portal session
4. License keys are auto-assigned from available pool
5. Customer sees their downloads with license keys in the dashboard

### License Key Assignment
- When a customer claims portal access, the system:
  1. Checks for available (unused) keys for products in their order
  2. Assigns the first available key to their order
  3. Marks the key as used
  4. Customer can view the key in their Downloads section

### Out of Stock Handling
If no keys are available for a product:
- Customer sees "Out of stock" message
- Message prompts them to open a support ticket
- Staff can add more keys via admin panel

## Product IDs
Use these product IDs when adding keys/downloads:

| Product | ID |
|---------|-----|
| Valorant | `valorant` |
| Fortnite Public | `fortnite` |
| Fortnite Private | `fortnite-private` |
| Apex Legends | `apex` |
| Rust | `rust` |
| Escape from Tarkov | `tarkov` |
| COD Black Ops 6 | `cod` |
| Rainbow Six Siege | `rainbow-six` |
| Permanent Spoofer | `spoofer-perm` |
| Temporary Spoofer | `spoofer-temp` |
| AI Aimbot | `aimbot` |
| Arc Raiders | `arc-raiders` |

## Customization

### Colors
Edit CSS variables in `portal-site/portal.css`:

```css
:root {
    --accent-primary: #3b82f6;    /* Primary button color */
    --accent-secondary: #8b5cf6;  /* Gradient secondary */
    --success: #10b981;           /* Active status */
    --error: #ef4444;             /* Error states */
}
```

### Particles
Adjust particle count in `portal-site/portal.js`:

```javascript
const particleCount = 50; // Increase/decrease for more/less particles
```

## Security Notes

1. License keys are masked by default (only show first/last 4 chars)
2. Keys are only revealed when customer clicks the eye icon
3. Used keys cannot be deleted (for audit trail)
4. All API endpoints require authentication

## Troubleshooting

### "No license keys available" error
- Add keys in Admin Panel → License Keys
- Ensure product_id matches the product in the order

### Downloads not showing
- Check that download URLs are configured in admin panel
- Verify product_id in order items matches configured downloads

### Portal not loading
- Check browser console for errors
- Verify `portal-site/vercel.json` has correct API proxy settings
- Ensure CORS headers are configured in main `vercel.json`
