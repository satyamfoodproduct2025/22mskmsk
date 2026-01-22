# Drishti Digital Library 📚

A modern, responsive self-study center website with admin panel built with Hono + TypeScript + Cloudflare Pages.

## 🌐 Live URLs

- **Website**: [Will be updated after Cloudflare deployment]
- **Admin Panel**: [Website URL]/admin
- **GitHub**: https://github.com/satyamfoodproduct2025/22mskmsk

## 👤 Admin Login Credentials

- **Username**: `Drishti`
- **Password**: `8252487551`

> ⚠️ **Important**: Change the password from Admin Panel after first login!

## ✨ Features

### Website Features
- 🎠 Hero Slider with dynamic slides
- ⏰ Study Shifts display (Morning, Noon, Evening, Night)
- 🏢 Premium facilities showcase (AC, WiFi, CCTV, RO Water, etc.)
- 📸 Dynamic photo gallery
- 📝 Contact form with database storage
- 🗺️ Google Maps integration
- 📱 Fully responsive (same 2-column grid on mobile)
- 💚 Floating WhatsApp button
- 🔗 Dynamic social media links

### Admin Panel Features
- 🔐 Secure login system
- 🖼️ Manage hero slides (add/edit/delete)
- 📷 Manage gallery images
- ⚙️ Update site settings (name, logo, phone, address, map)
- 🔗 Manage social media links
- 📬 View contact form submissions
- 🔑 Change admin password

### Legal Pages (for Payment Gateway)
- 📜 Terms & Conditions
- 🔒 Privacy Policy
- 💰 Refund & Cancellation Policy
- 📞 Contact Us

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript, Tailwind CSS (CDN)
- **Backend**: Hono (TypeScript)
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Cloudflare Pages
- **Icons**: Font Awesome

## 📊 Database Setup (Supabase)

### Step 1: Go to Supabase SQL Editor
1. Login to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `ytsdcglnbxpybdfnucjn`
3. Go to **SQL Editor** → **New Query**

### Step 2: Run the SQL Script
Copy and paste the complete SQL code from below and click **Run**:

```sql
-- =============================================
-- DRISHTI DIGITAL LIBRARY DATABASE SETUP
-- =============================================

-- 1. Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin (Username: Drishti, Password: 8252487551)
INSERT INTO admin_users (username, password) 
VALUES ('Drishti', '8252487551')
ON CONFLICT (username) DO UPDATE SET password = '8252487551';

-- 2. Site Settings Table
CREATE TABLE IF NOT EXISTS site_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO site_settings (key, value) VALUES 
    ('site_name', 'DRISHTI DIGITAL'),
    ('logo_url', 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=100&h=100&fit=crop'),
    ('phone', '9876543210'),
    ('whatsapp', '9876543210'),
    ('address', 'Sakchi Main Road, Jamshedpur, Jharkhand - 831001'),
    ('map_embed', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m13!1d58842.16434850721!2d86.1558223405761!3d22.815918731175654!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39f5e31989f0e2b3%3A0x4560124953c80051!2sSakchi%2C%20Jamshedpur%2C%20Jharkhand!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin')
ON CONFLICT (key) DO NOTHING;

-- 3. Hero Slides Table
CREATE TABLE IF NOT EXISTS hero_slides (
    id SERIAL PRIMARY KEY,
    image_url TEXT NOT NULL,
    title VARCHAR(255) NOT NULL,
    subtitle TEXT,
    order_num INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default slides
INSERT INTO hero_slides (image_url, title, subtitle, order_num) VALUES 
    ('https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1350&q=80', 'शान्त वातावरण, बेहतर पढ़ाई', 'Drishti Digital Library में आपका स्वागत है', 1),
    ('https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1350&q=80', 'Focus on Your Success', 'आधुनिक सुविधाओं के साथ अपनी मंज़िल को पाएं', 2);

-- 4. Gallery Images Table
CREATE TABLE IF NOT EXISTS gallery_images (
    id SERIAL PRIMARY KEY,
    image_url TEXT NOT NULL,
    caption VARCHAR(255),
    order_num INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default gallery images
INSERT INTO gallery_images (image_url, caption, order_num) VALUES 
    ('https://images.unsplash.com/photo-1491841573634-28140fc7ced7?auto=format&fit=crop&w=600&q=80', 'Study Hall', 1),
    ('https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80', 'Reading Area', 2),
    ('https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=600&q=80', 'Books Collection', 3),
    ('https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=600&q=80', 'Modern Interior', 4);

-- 5. Social Links Table
CREATE TABLE IF NOT EXISTS social_links (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default social links
INSERT INTO social_links (platform, url) VALUES 
    ('whatsapp', 'https://wa.me/919876543210'),
    ('instagram', 'https://instagram.com'),
    ('facebook', 'https://facebook.com'),
    ('youtube', 'https://youtube.com');

-- 6. Contact Form Submissions Table
CREATE TABLE IF NOT EXISTS contact_submissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    shift VARCHAR(100),
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Enable Row Level Security
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hero_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- 8. Create policies
CREATE POLICY "Allow all for admin_users" ON admin_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for site_settings" ON site_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for hero_slides" ON hero_slides FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for gallery_images" ON gallery_images FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for social_links" ON social_links FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for contact_submissions" ON contact_submissions FOR ALL USING (true) WITH CHECK (true);
```

## 🚀 Cloudflare Deployment

### Manual Deployment Steps:

1. **Login to Cloudflare Dashboard**: https://dash.cloudflare.com

2. **Create Pages Project**:
   - Go to Workers & Pages → Create → Pages
   - Connect to GitHub → Select repository `22mskmsk`
   - Project name: `drishti-digital-library`
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `dist`

3. **Set Environment Variables**:
   Go to Settings → Environment variables → Add:
   ```
   SUPABASE_URL = https://ytsdcglnbxpybdfnucjn.supabase.co
   SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0c2RjZ2xuYnhweWJkZm51Y2puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxNTc4MjQsImV4cCI6MjA4MTczMzgyNH0.k23-pdsw4fqRUMXp3-MMG1strgQa_J8hGBMlE1HATwg
   ```

4. **Deploy**: Click "Save and Deploy"

### Using Wrangler CLI:

```bash
# Build
npm run build

# Create project
npx wrangler pages project create drishti-digital-library --production-branch main

# Deploy
npx wrangler pages deploy dist --project-name drishti-digital-library
```

## 📱 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings` | GET | Get all site settings |
| `/api/settings` | POST | Update site settings |
| `/api/slides` | GET | Get hero slides |
| `/api/slides` | POST | Add new slide |
| `/api/slides/:id` | PUT | Update slide |
| `/api/slides/:id` | DELETE | Delete slide |
| `/api/gallery` | GET | Get gallery images |
| `/api/gallery` | POST | Add gallery image |
| `/api/gallery/:id` | PUT | Update image |
| `/api/gallery/:id` | DELETE | Delete image |
| `/api/social-links` | GET | Get social links |
| `/api/social-links` | POST | Add social link |
| `/api/social-links/:id` | PUT | Update link |
| `/api/social-links/:id` | DELETE | Delete link |
| `/api/contact` | GET | Get submissions |
| `/api/contact` | POST | Submit contact form |
| `/api/admin/login` | POST | Admin login |
| `/api/admin/change-password` | POST | Change password |

## 📁 Project Structure

```
drishti-digital-library/
├── src/
│   └── index.tsx          # Main Hono app with all routes
├── public/
│   └── static/            # Static assets
├── dist/                  # Build output
├── ecosystem.config.cjs   # PM2 config
├── wrangler.jsonc         # Cloudflare config
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🔐 Security Notes

- Admin password is stored in plain text (for simplicity)
- For production, consider hashing passwords
- Supabase RLS policies are set to allow all (adjust for production)

## 📞 Support

For any issues, contact the developer or raise an issue on GitHub.

---

**Last Updated**: January 2026
