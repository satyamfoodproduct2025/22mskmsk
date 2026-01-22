import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-pages'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic())

// ============ Supabase Helper ============
async function supabaseRequest(env: Bindings, endpoint: string, options: RequestInit = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/${endpoint}`
  const headers = {
    'apikey': env.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  }
  const res = await fetch(url, { ...options, headers })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Supabase error: ${res.status} - ${errorText}`)
  }
  return res.json()
}

// ============ Admin Auth API ============
app.post('/api/admin/login', async (c) => {
  try {
    const { username, password } = await c.req.json()
    const admins = await supabaseRequest(c.env, `admin_users?username=eq.${username}&select=*`)
    
    if (admins.length === 0) {
      return c.json({ success: false, message: 'Invalid credentials' }, 401)
    }
    
    const admin = admins[0]
    if (admin.password !== password) {
      return c.json({ success: false, message: 'Invalid credentials' }, 401)
    }
    
    // Generate simple token
    const token = btoa(`${username}:${Date.now()}`)
    return c.json({ success: true, token, admin: { id: admin.id, username: admin.username } })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

app.post('/api/admin/change-password', async (c) => {
  try {
    const { username, currentPassword, newPassword } = await c.req.json()
    const admins = await supabaseRequest(c.env, `admin_users?username=eq.${username}&select=*`)
    
    if (admins.length === 0 || admins[0].password !== currentPassword) {
      return c.json({ success: false, message: 'Invalid current password' }, 401)
    }
    
    await supabaseRequest(c.env, `admin_users?id=eq.${admins[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ password: newPassword })
    })
    
    return c.json({ success: true, message: 'Password updated successfully' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// ============ Site Settings API ============
app.get('/api/settings', async (c) => {
  try {
    const settings = await supabaseRequest(c.env, 'site_settings?select=*')
    // Convert array to object
    const settingsObj: Record<string, string> = {}
    settings.forEach((s: any) => {
      settingsObj[s.key] = s.value
    })
    return c.json(settingsObj)
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

app.post('/api/settings', async (c) => {
  try {
    const updates = await c.req.json()
    
    for (const [key, value] of Object.entries(updates)) {
      // Try update first, if not exists, insert
      await supabaseRequest(c.env, `site_settings?key=eq.${key}`, {
        method: 'PATCH',
        body: JSON.stringify({ value }),
        headers: { 'Prefer': 'return=minimal' }
      }).catch(async () => {
        await supabaseRequest(c.env, 'site_settings', {
          method: 'POST',
          body: JSON.stringify({ key, value })
        })
      })
    }
    
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// Upsert setting (insert or update)
app.put('/api/settings/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const { value } = await c.req.json()
    
    // Check if exists
    const existing = await supabaseRequest(c.env, `site_settings?key=eq.${key}&select=id`)
    
    if (existing.length > 0) {
      await supabaseRequest(c.env, `site_settings?key=eq.${key}`, {
        method: 'PATCH',
        body: JSON.stringify({ value })
      })
    } else {
      await supabaseRequest(c.env, 'site_settings', {
        method: 'POST',
        body: JSON.stringify({ key, value })
      })
    }
    
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// ============ Hero Slides API ============
app.get('/api/slides', async (c) => {
  try {
    const slides = await supabaseRequest(c.env, 'hero_slides?select=*&order=order_num.asc')
    return c.json(slides)
  } catch (error: any) {
    return c.json([], 200)
  }
})

app.post('/api/slides', async (c) => {
  try {
    const slide = await c.req.json()
    const result = await supabaseRequest(c.env, 'hero_slides', {
      method: 'POST',
      body: JSON.stringify(slide)
    })
    return c.json(result[0])
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

app.put('/api/slides/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const slide = await c.req.json()
    await supabaseRequest(c.env, `hero_slides?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(slide)
    })
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

app.delete('/api/slides/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await supabaseRequest(c.env, `hero_slides?id=eq.${id}`, {
      method: 'DELETE'
    })
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// ============ Social Links API ============
app.get('/api/social-links', async (c) => {
  try {
    const links = await supabaseRequest(c.env, 'social_links?select=*')
    return c.json(links)
  } catch (error: any) {
    return c.json([], 200)
  }
})

app.post('/api/social-links', async (c) => {
  try {
    const link = await c.req.json()
    const result = await supabaseRequest(c.env, 'social_links', {
      method: 'POST',
      body: JSON.stringify(link)
    })
    return c.json(result[0])
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

app.put('/api/social-links/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const link = await c.req.json()
    await supabaseRequest(c.env, `social_links?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(link)
    })
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

app.delete('/api/social-links/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await supabaseRequest(c.env, `social_links?id=eq.${id}`, {
      method: 'DELETE'
    })
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// ============ Contact Form Submissions ============
app.post('/api/contact', async (c) => {
  try {
    const data = await c.req.json()
    const result = await supabaseRequest(c.env, 'contact_submissions', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        phone: data.phone,
        shift: data.shift,
        message: data.message || ''
      })
    })
    return c.json({ success: true, message: 'धन्यवाद! हम आपसे जल्द संपर्क करेंगे।' })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

app.get('/api/contact', async (c) => {
  try {
    const submissions = await supabaseRequest(c.env, 'contact_submissions?select=*&order=created_at.desc')
    return c.json(submissions)
  } catch (error: any) {
    return c.json([], 200)
  }
})

// ============ Gallery API ============
app.get('/api/gallery', async (c) => {
  try {
    const images = await supabaseRequest(c.env, 'gallery_images?select=*&order=order_num.asc')
    return c.json(images)
  } catch (error: any) {
    return c.json([], 200)
  }
})

app.post('/api/gallery', async (c) => {
  try {
    const image = await c.req.json()
    const result = await supabaseRequest(c.env, 'gallery_images', {
      method: 'POST',
      body: JSON.stringify(image)
    })
    return c.json(result[0])
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

app.put('/api/gallery/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const image = await c.req.json()
    await supabaseRequest(c.env, `gallery_images?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(image)
    })
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

app.delete('/api/gallery/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await supabaseRequest(c.env, `gallery_images?id=eq.${id}`, {
      method: 'DELETE'
    })
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

// ============ Main HTML Pages ============

// Homepage
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="hi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Drishti Digital Library | Self Study Center</title>
    <meta name="description" content="Drishti Digital Library - Premium Self Study Center with AC, WiFi, CCTV and peaceful environment for competitive exam preparation.">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <style>
        :root {
            --primary: #0a1628;
            --primary-light: #1e3a5f;
            --accent: #f59e0b;
            --accent-dark: #d97706;
            --accent-light: #fcd34d;
            --light: #f8fafc;
            --white: #ffffff;
            --gray: #94a3b8;
            --dark-gray: #475569;
            --gradient: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            --gradient-dark: linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%);
            --whatsapp: #25d366;
            --instagram: #e1306c;
            --facebook: #1877f2;
            --youtube: #ff0000;
            --shadow: 0 10px 40px rgba(0,0,0,0.15);
            --shadow-sm: 0 4px 15px rgba(0,0,0,0.1);
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Outfit', sans-serif; 
            background: var(--light); 
            color: var(--primary);
            overflow-x: hidden;
            line-height: 1.6;
        }
        
        /* Animations */
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse { 
            0%, 100% { transform: scale(1); } 
            50% { transform: scale(1.1); } 
        }
        @keyframes float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-10px); }
        }
        @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        .reveal { 
            opacity: 0; 
            transform: translateY(40px); 
            transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1); 
        }
        .reveal.active { opacity: 1; transform: translateY(0); }
        
        /* Navigation */
        nav {
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(20px);
            padding: 12px 5%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: fixed;
            width: 100%;
            top: 0;
            z-index: 1000;
            box-shadow: 0 2px 20px rgba(0,0,0,0.08);
            transition: all 0.3s ease;
        }
        nav.scrolled {
            padding: 8px 5%;
            box-shadow: 0 4px 30px rgba(0,0,0,0.12);
        }
        .logo-container {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .logo-img {
            width: 45px;
            height: 45px;
            border-radius: 10px;
            object-fit: cover;
            box-shadow: var(--shadow-sm);
        }
        .logo-text {
            font-size: 1.3rem;
            font-weight: 700;
            background: var(--gradient-dark);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            line-height: 1.2;
        }
        .logo-text span {
            display: block;
            font-size: 0.7rem;
            font-weight: 500;
            color: var(--accent);
            -webkit-text-fill-color: var(--accent);
        }
        .nav-links {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .nav-link {
            text-decoration: none;
            color: var(--primary);
            font-weight: 500;
            font-size: 0.9rem;
            padding: 8px 15px;
            border-radius: 25px;
            transition: all 0.3s ease;
        }
        .nav-link:hover {
            background: var(--light);
            color: var(--accent);
        }
        .nav-cta {
            background: var(--gradient);
            color: white !important;
            padding: 10px 20px !important;
            box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
        }
        .nav-cta:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(245, 158, 11, 0.5);
        }
        
        /* Hero Slider */
        .hero-container {
            position: relative;
            width: 100%;
            height: 100vh;
            min-height: 600px;
            overflow: hidden;
            margin-top: 0;
        }
        .slide {
            position: absolute;
            width: 100%;
            height: 100%;
            opacity: 0;
            transition: opacity 1.5s ease-in-out;
            background-size: cover;
            background-position: center;
        }
        .slide.active { opacity: 1; }
        .slide-overlay {
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, rgba(10, 22, 40, 0.85) 0%, rgba(30, 58, 95, 0.7) 100%);
        }
        .slide-content {
            position: relative;
            z-index: 2;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            padding: 20px;
            color: white;
        }
        .slide-content h1 {
            font-size: clamp(1.8rem, 5vw, 3.5rem);
            font-weight: 800;
            margin-bottom: 15px;
            text-shadow: 2px 2px 10px rgba(0,0,0,0.3);
            animation: fadeInUp 1s ease-out;
        }
        .slide-content p {
            font-size: clamp(0.9rem, 2.5vw, 1.3rem);
            max-width: 600px;
            margin-bottom: 25px;
            opacity: 0.95;
            animation: fadeInUp 1s ease-out 0.2s both;
        }
        .hero-btn {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            background: var(--gradient);
            color: white;
            padding: 15px 35px;
            border-radius: 50px;
            text-decoration: none;
            font-weight: 600;
            font-size: 1rem;
            box-shadow: 0 8px 30px rgba(245, 158, 11, 0.4);
            transition: all 0.3s ease;
            animation: fadeInUp 1s ease-out 0.4s both;
        }
        .hero-btn:hover {
            transform: translateY(-3px) scale(1.02);
            box-shadow: 0 12px 40px rgba(245, 158, 11, 0.5);
        }
        .slide-indicators {
            position: absolute;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            gap: 10px;
            z-index: 10;
        }
        .indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: rgba(255,255,255,0.4);
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .indicator.active {
            background: var(--accent);
            width: 35px;
            border-radius: 6px;
        }
        
        /* Section Styles */
        .section {
            padding: 70px 5%;
        }
        .section-header {
            text-align: center;
            margin-bottom: 50px;
        }
        .section-header h2 {
            font-size: clamp(1.6rem, 4vw, 2.5rem);
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 15px;
            position: relative;
            display: inline-block;
        }
        .section-header h2::after {
            content: '';
            position: absolute;
            bottom: -10px;
            left: 50%;
            transform: translateX(-50%);
            width: 60px;
            height: 4px;
            background: var(--gradient);
            border-radius: 2px;
        }
        .section-header p {
            color: var(--dark-gray);
            font-size: 1rem;
            max-width: 500px;
            margin: 20px auto 0;
        }
        
        /* Shifts & Facilities Grid - Fixed 2 columns on all screens */
        .grid-2col {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            max-width: 900px;
            margin: 0 auto;
        }
        .card {
            background: var(--white);
            padding: 25px 15px;
            border-radius: 20px;
            text-align: center;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            border: 1px solid rgba(0,0,0,0.05);
            position: relative;
            overflow: hidden;
        }
        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: var(--gradient);
            transform: scaleX(0);
            transition: transform 0.4s ease;
        }
        .card:hover::before {
            transform: scaleX(1);
        }
        .card:hover {
            transform: translateY(-8px);
            box-shadow: var(--shadow);
        }
        .card-icon {
            width: 60px;
            height: 60px;
            border-radius: 15px;
            background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.1) 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 15px;
        }
        .card-icon i {
            font-size: 1.5rem;
            background: var(--gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .card h3 {
            font-size: 1rem;
            font-weight: 600;
            color: var(--primary);
            margin-bottom: 5px;
        }
        .card p {
            font-size: 0.85rem;
            color: var(--gray);
        }
        
        /* Gallery */
        .gallery-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            max-width: 1000px;
            margin: 0 auto;
        }
        .gallery-item {
            height: 180px;
            border-radius: 15px;
            overflow: hidden;
            cursor: pointer;
            position: relative;
        }
        .gallery-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: all 0.5s ease;
        }
        .gallery-item::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%);
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        .gallery-item:hover img {
            transform: scale(1.1);
        }
        .gallery-item:hover::after {
            opacity: 1;
        }
        
        /* Booking Section */
        .booking-section {
            background: var(--white);
        }
        .booking-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
            background: var(--white);
            border-radius: 25px;
            overflow: hidden;
            box-shadow: var(--shadow);
            max-width: 1000px;
            margin: 0 auto;
        }
        .booking-info {
            background: var(--gradient-dark);
            color: white;
            padding: 40px 30px;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .booking-info h3 {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 15px;
        }
        .booking-info p {
            opacity: 0.9;
            margin-bottom: 25px;
            font-size: 0.95rem;
        }
        .booking-features {
            list-style: none;
        }
        .booking-features li {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 12px;
            font-size: 0.9rem;
        }
        .booking-features li i {
            color: var(--accent);
        }
        .booking-form {
            padding: 40px 30px;
        }
        .form-group {
            margin-bottom: 18px;
        }
        .form-group label {
            display: block;
            font-size: 0.85rem;
            font-weight: 500;
            color: var(--dark-gray);
            margin-bottom: 6px;
        }
        .form-group input,
        .form-group select {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            font-size: 0.95rem;
            transition: all 0.3s ease;
            font-family: inherit;
        }
        .form-group input:focus,
        .form-group select:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.1);
        }
        .btn-submit {
            width: 100%;
            padding: 14px;
            background: var(--gradient);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            font-family: inherit;
        }
        .btn-submit:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(245, 158, 11, 0.4);
        }
        
        /* Map Section */
        .map-section {
            padding: 0 5% 0;
        }
        .map-container {
            border-radius: 20px 20px 0 0;
            overflow: hidden;
            box-shadow: 0 -10px 40px rgba(0,0,0,0.1);
        }
        .map-container iframe {
            width: 100%;
            height: 350px;
            border: none;
        }
        
        /* Footer */
        footer {
            background: var(--primary);
            color: white;
            padding: 50px 5% 20px;
        }
        .footer-content {
            max-width: 1200px;
            margin: 0 auto;
            text-align: center;
        }
        .footer-logo {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 10px;
        }
        .footer-logo span {
            color: var(--accent);
        }
        .footer-address {
            color: var(--gray);
            margin-bottom: 25px;
            font-size: 0.95rem;
            line-height: 1.8;
        }
        .social-links {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-bottom: 30px;
        }
        .social-link {
            width: 45px;
            height: 45px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            color: white;
            text-decoration: none;
            transition: all 0.3s ease;
        }
        .social-link.whatsapp { background: var(--whatsapp); }
        .social-link.instagram { background: var(--instagram); }
        .social-link.facebook { background: var(--facebook); }
        .social-link.youtube { background: var(--youtube); }
        .social-link:hover {
            transform: translateY(-5px) scale(1.1);
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
        }
        .footer-links {
            display: flex;
            justify-content: center;
            gap: 20px;
            flex-wrap: wrap;
            margin-bottom: 25px;
        }
        .footer-links a {
            color: var(--gray);
            text-decoration: none;
            font-size: 0.85rem;
            transition: color 0.3s ease;
        }
        .footer-links a:hover {
            color: var(--accent);
        }
        .copyright {
            color: var(--gray);
            font-size: 0.85rem;
            padding-top: 20px;
            border-top: 1px solid rgba(255,255,255,0.1);
        }
        
        /* Floating WhatsApp */
        .whatsapp-float {
            position: fixed;
            bottom: 25px;
            right: 25px;
            width: 60px;
            height: 60px;
            background: var(--whatsapp);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            text-decoration: none;
            box-shadow: 0 4px 20px rgba(37, 211, 102, 0.4);
            z-index: 999;
            animation: pulse 2s infinite;
            transition: all 0.3s ease;
        }
        .whatsapp-float:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 30px rgba(37, 211, 102, 0.5);
        }
        
        /* Mobile Responsive - Keep 2 column grid */
        @media (max-width: 768px) {
            nav {
                padding: 10px 4%;
            }
            .logo-img {
                width: 38px;
                height: 38px;
            }
            .logo-text {
                font-size: 1rem;
            }
            .logo-text span {
                font-size: 0.6rem;
            }
            .nav-links {
                gap: 8px;
            }
            .nav-link {
                font-size: 0.75rem;
                padding: 6px 10px;
            }
            .nav-cta {
                padding: 8px 12px !important;
            }
            .hero-container {
                height: 85vh;
                min-height: 500px;
            }
            .section {
                padding: 50px 4%;
            }
            .grid-2col {
                gap: 10px;
            }
            .card {
                padding: 18px 10px;
                border-radius: 15px;
            }
            .card-icon {
                width: 45px;
                height: 45px;
                border-radius: 12px;
                margin-bottom: 10px;
            }
            .card-icon i {
                font-size: 1.2rem;
            }
            .card h3 {
                font-size: 0.85rem;
            }
            .card p {
                font-size: 0.75rem;
            }
            .gallery-grid {
                gap: 10px;
            }
            .gallery-item {
                height: 140px;
                border-radius: 12px;
            }
            .booking-container {
                grid-template-columns: 1fr;
                border-radius: 20px;
            }
            .booking-info {
                padding: 30px 20px;
            }
            .booking-info h3 {
                font-size: 1.3rem;
            }
            .booking-form {
                padding: 30px 20px;
            }
            .map-container iframe {
                height: 280px;
            }
            .footer-logo {
                font-size: 1.3rem;
            }
            .social-link {
                width: 40px;
                height: 40px;
                font-size: 1rem;
            }
            .whatsapp-float {
                width: 55px;
                height: 55px;
                font-size: 24px;
                bottom: 20px;
                right: 20px;
            }
        }
        
        @media (max-width: 400px) {
            .logo-text {
                font-size: 0.9rem;
            }
            .nav-link:not(.nav-cta) {
                display: none;
            }
            .card {
                padding: 15px 8px;
            }
            .card-icon {
                width: 40px;
                height: 40px;
            }
            .card-icon i {
                font-size: 1rem;
            }
            .card h3 {
                font-size: 0.8rem;
            }
            .card p {
                font-size: 0.7rem;
            }
        }
        
        /* Loading State */
        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
        }
        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(245, 158, 11, 0.2);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <!-- WhatsApp Float -->
    <a href="#" id="whatsappFloat" class="whatsapp-float" target="_blank">
        <i class="fab fa-whatsapp"></i>
    </a>
    
    <!-- Navigation -->
    <nav id="navbar">
        <div class="logo-container">
            <img src="https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=100&h=100&fit=crop" alt="Logo" class="logo-img" id="navLogo">
            <div class="logo-text">
                <span id="siteName">DRISHTI DIGITAL</span>
                LIBRARY
            </div>
        </div>
        <div class="nav-links">
            <a href="#shifts" class="nav-link">Shifts</a>
            <a href="#facilities" class="nav-link">Facilities</a>
            <a href="tel:+919876543210" class="nav-link nav-cta" id="navPhone">
                <i class="fas fa-phone"></i> Call
            </a>
        </div>
    </nav>
    
    <!-- Hero Slider -->
    <div class="hero-container" id="heroSlider">
        <!-- Slides will be loaded dynamically -->
    </div>
    
    <!-- Shifts Section -->
    <section class="section reveal" id="shifts">
        <div class="section-header">
            <h2>हमारी शिफ्ट्स</h2>
            <p>अपनी सुविधा अनुसार शिफ्ट चुनें</p>
        </div>
        <div class="grid-2col">
            <div class="card">
                <div class="card-icon"><i class="fas fa-coffee"></i></div>
                <h3>06:00 - 10:00 AM</h3>
                <p>सुबह की ताज़गी</p>
            </div>
            <div class="card">
                <div class="card-icon"><i class="fas fa-sun"></i></div>
                <h3>10:00 - 02:00 PM</h3>
                <p>दिन का जोश</p>
            </div>
            <div class="card">
                <div class="card-icon"><i class="fas fa-cloud-sun"></i></div>
                <h3>02:00 - 06:00 PM</h3>
                <p>शाम की एकाग्रता</p>
            </div>
            <div class="card">
                <div class="card-icon"><i class="fas fa-moon"></i></div>
                <h3>06:00 - 10:00 PM</h3>
                <p>रात का सुकून</p>
            </div>
        </div>
    </section>
    
    <!-- Facilities Section -->
    <section class="section reveal" id="facilities" style="background: white;">
        <div class="section-header">
            <h2>प्रीमियम सुविधाएँ</h2>
            <p>आधुनिक सुविधाओं से लैस</p>
        </div>
        <div class="grid-2col">
            <div class="card">
                <div class="card-icon"><i class="fas fa-snowflake"></i></div>
                <h3>Fully AC</h3>
                <p>पूरी तरह वातानुकूलित</p>
            </div>
            <div class="card">
                <div class="card-icon"><i class="fas fa-wifi"></i></div>
                <h3>High Speed WiFi</h3>
                <p>तेज़ इंटरनेट</p>
            </div>
            <div class="card">
                <div class="card-icon"><i class="fas fa-video"></i></div>
                <h3>CCTV Security</h3>
                <p>24x7 निगरानी</p>
            </div>
            <div class="card">
                <div class="card-icon"><i class="fas fa-newspaper"></i></div>
                <h3>Newspapers</h3>
                <p>दैनिक अखबार</p>
            </div>
            <div class="card">
                <div class="card-icon"><i class="fas fa-bolt"></i></div>
                <h3>Power Backup</h3>
                <p>निर्बाध बिजली</p>
            </div>
            <div class="card">
                <div class="card-icon"><i class="fas fa-tint"></i></div>
                <h3>RO Water</h3>
                <p>शुद्ध पेयजल</p>
            </div>
        </div>
    </section>
    
    <!-- Gallery Section -->
    <section class="section reveal" id="gallery">
        <div class="section-header">
            <h2>लाइब्रेरी की झलक</h2>
            <p>हमारे स्टडी सेंटर की तस्वीरें</p>
        </div>
        <div class="gallery-grid" id="galleryGrid">
            <!-- Gallery images will be loaded dynamically -->
        </div>
    </section>
    
    <!-- Booking Section -->
    <section class="section booking-section reveal" id="booking">
        <div class="booking-container">
            <div class="booking-info">
                <h3>आज ही जुड़ें!</h3>
                <p>फॉर्म भरें, हम आपसे संपर्क करके फीस और सीट की जानकारी देंगे।</p>
                <ul class="booking-features">
                    <li><i class="fas fa-check-circle"></i> Affordable Pricing</li>
                    <li><i class="fas fa-check-circle"></i> Permanent Seat Option</li>
                    <li><i class="fas fa-check-circle"></i> Flexible Shifts</li>
                    <li><i class="fas fa-check-circle"></i> Peaceful Environment</li>
                </ul>
            </div>
            <div class="booking-form">
                <form id="contactForm">
                    <div class="form-group">
                        <label>आपका पूरा नाम</label>
                        <input type="text" name="name" placeholder="अपना नाम लिखें" required>
                    </div>
                    <div class="form-group">
                        <label>मोबाइल नंबर</label>
                        <input type="tel" name="phone" placeholder="10 अंक का मोबाइल नंबर" pattern="[0-9]{10}" required>
                    </div>
                    <div class="form-group">
                        <label>शिफ्ट चुनें</label>
                        <select name="shift" required>
                            <option value="">-- शिफ्ट चुनें --</option>
                            <option value="Morning (06-10 AM)">Morning (06-10 AM)</option>
                            <option value="Noon (10-02 PM)">Noon (10-02 PM)</option>
                            <option value="Evening (02-06 PM)">Evening (02-06 PM)</option>
                            <option value="Night (06-10 PM)">Night (06-10 PM)</option>
                            <option value="Full Day">Full Day Session</option>
                        </select>
                    </div>
                    <button type="submit" class="btn-submit">
                        <i class="fas fa-paper-plane"></i> डिटेल्स भेजें
                    </button>
                </form>
            </div>
        </div>
    </section>
    
    <!-- Map Section -->
    <section class="map-section reveal">
        <div class="map-container">
            <iframe id="googleMap" src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m13!1d58842.16434850721!2d86.1558223405761!3d22.815918731175654!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39f5e31989f0e2b3%3A0x4560124953c80051!2sSakchi%2C%20Jamshedpur%2C%20Jharkhand!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin" allowfullscreen="" loading="lazy"></iframe>
        </div>
    </section>
    
    <!-- Footer -->
    <footer>
        <div class="footer-content">
            <div class="footer-logo" id="footerLogo">DRISHTI DIGITAL <span>LIBRARY</span></div>
            <div class="footer-address" id="footerAddress">
                Sakchi Main Road, Jamshedpur, Jharkhand - 831001<br>
                Helpline: +91 98765 43210
            </div>
            <div class="social-links" id="socialLinks">
                <!-- Social links will be loaded dynamically -->
            </div>
            <div class="footer-links">
                <a href="/terms">Terms & Conditions</a>
                <a href="/privacy">Privacy Policy</a>
                <a href="/refund">Refund Policy</a>
                <a href="/contact">Contact Us</a>
            </div>
            <p class="copyright">© 2026 Drishti Digital Library. All Rights Reserved.</p>
        </div>
    </footer>
    
    <script>
        // Global settings
        let siteSettings = {};
        
        // Fetch site settings
        async function loadSettings() {
            try {
                const res = await fetch('/api/settings');
                siteSettings = await res.json();
                applySettings();
            } catch (e) {
                console.log('Using default settings');
                applyDefaultSettings();
            }
        }
        
        function applySettings() {
            // Logo
            if (siteSettings.logo_url) {
                document.getElementById('navLogo').src = siteSettings.logo_url;
            }
            // Site name
            if (siteSettings.site_name) {
                document.getElementById('siteName').textContent = siteSettings.site_name;
                document.getElementById('footerLogo').innerHTML = siteSettings.site_name + ' <span>LIBRARY</span>';
            }
            // Phone
            if (siteSettings.phone) {
                document.getElementById('navPhone').href = 'tel:+91' + siteSettings.phone;
                document.getElementById('whatsappFloat').href = 'https://wa.me/91' + siteSettings.phone;
            }
            // Address
            if (siteSettings.address) {
                let addressHtml = siteSettings.address;
                if (siteSettings.phone) {
                    addressHtml += '<br>Helpline: +91 ' + siteSettings.phone;
                }
                document.getElementById('footerAddress').innerHTML = addressHtml;
            }
            // Map
            if (siteSettings.map_embed) {
                document.getElementById('googleMap').src = siteSettings.map_embed;
            }
        }
        
        function applyDefaultSettings() {
            // Default WhatsApp
            document.getElementById('whatsappFloat').href = 'https://wa.me/919876543210';
        }
        
        // Load hero slides
        async function loadSlides() {
            const container = document.getElementById('heroSlider');
            try {
                const res = await fetch('/api/slides');
                const slides = await res.json();
                
                if (slides.length === 0) {
                    // Default slides
                    renderSlides([
                        { image_url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1350&q=80', title: 'शान्त वातावरण, बेहतर पढ़ाई', subtitle: 'Drishti Digital Library में आपका स्वागत है' },
                        { image_url: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1350&q=80', title: 'Focus on Your Success', subtitle: 'आधुनिक सुविधाओं के साथ अपनी मंज़िल को पाएं' }
                    ]);
                } else {
                    renderSlides(slides);
                }
            } catch (e) {
                // Default slides on error
                renderSlides([
                    { image_url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1350&q=80', title: 'शान्त वातावरण, बेहतर पढ़ाई', subtitle: 'Drishti Digital Library में आपका स्वागत है' },
                    { image_url: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1350&q=80', title: 'Focus on Your Success', subtitle: 'आधुनिक सुविधाओं के साथ अपनी मंज़िल को पाएं' }
                ]);
            }
        }
        
        function renderSlides(slides) {
            const container = document.getElementById('heroSlider');
            let html = '';
            slides.forEach((slide, i) => {
                html += \`
                    <div class="slide \${i === 0 ? 'active' : ''}" style="background-image: url('\${slide.image_url}');">
                        <div class="slide-overlay"></div>
                        <div class="slide-content">
                            <h1>\${slide.title}</h1>
                            <p>\${slide.subtitle}</p>
                            <a href="#booking" class="hero-btn">
                                <i class="fas fa-calendar-check"></i> अभी बुक करें
                            </a>
                        </div>
                    </div>
                \`;
            });
            html += '<div class="slide-indicators">';
            slides.forEach((_, i) => {
                html += \`<div class="indicator \${i === 0 ? 'active' : ''}" data-index="\${i}"></div>\`;
            });
            html += '</div>';
            container.innerHTML = html;
            initSlider();
        }
        
        function initSlider() {
            const slides = document.querySelectorAll('.slide');
            const indicators = document.querySelectorAll('.indicator');
            let currentSlide = 0;
            
            function showSlide(index) {
                slides.forEach((s, i) => {
                    s.classList.toggle('active', i === index);
                });
                indicators.forEach((ind, i) => {
                    ind.classList.toggle('active', i === index);
                });
                currentSlide = index;
            }
            
            // Auto slide
            setInterval(() => {
                showSlide((currentSlide + 1) % slides.length);
            }, 5000);
            
            // Click indicators
            indicators.forEach(ind => {
                ind.addEventListener('click', () => {
                    showSlide(parseInt(ind.dataset.index));
                });
            });
        }
        
        // Load gallery
        async function loadGallery() {
            const grid = document.getElementById('galleryGrid');
            try {
                const res = await fetch('/api/gallery');
                const images = await res.json();
                
                if (images.length === 0) {
                    renderGallery([
                        { image_url: 'https://images.unsplash.com/photo-1491841573634-28140fc7ced7?auto=format&fit=crop&w=600&q=80' },
                        { image_url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80' },
                        { image_url: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=600&q=80' },
                        { image_url: 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=600&q=80' }
                    ]);
                } else {
                    renderGallery(images);
                }
            } catch (e) {
                renderGallery([
                    { image_url: 'https://images.unsplash.com/photo-1491841573634-28140fc7ced7?auto=format&fit=crop&w=600&q=80' },
                    { image_url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80' },
                    { image_url: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=600&q=80' },
                    { image_url: 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=600&q=80' }
                ]);
            }
        }
        
        function renderGallery(images) {
            const grid = document.getElementById('galleryGrid');
            grid.innerHTML = images.map(img => \`
                <div class="gallery-item">
                    <img src="\${img.image_url}" alt="Library" loading="lazy">
                </div>
            \`).join('');
        }
        
        // Load social links
        async function loadSocialLinks() {
            const container = document.getElementById('socialLinks');
            try {
                const res = await fetch('/api/social-links');
                const links = await res.json();
                
                if (links.length === 0) {
                    renderSocialLinks([
                        { platform: 'whatsapp', url: 'https://wa.me/919876543210' },
                        { platform: 'instagram', url: '#' },
                        { platform: 'facebook', url: '#' },
                        { platform: 'youtube', url: '#' }
                    ]);
                } else {
                    renderSocialLinks(links);
                }
            } catch (e) {
                renderSocialLinks([
                    { platform: 'whatsapp', url: 'https://wa.me/919876543210' },
                    { platform: 'instagram', url: '#' },
                    { platform: 'facebook', url: '#' },
                    { platform: 'youtube', url: '#' }
                ]);
            }
        }
        
        function renderSocialLinks(links) {
            const container = document.getElementById('socialLinks');
            const iconMap = {
                whatsapp: 'fab fa-whatsapp',
                instagram: 'fab fa-instagram',
                facebook: 'fab fa-facebook-f',
                youtube: 'fab fa-youtube',
                twitter: 'fab fa-twitter',
                telegram: 'fab fa-telegram'
            };
            container.innerHTML = links.map(link => \`
                <a href="\${link.url}" class="social-link \${link.platform}" target="_blank">
                    <i class="\${iconMap[link.platform] || 'fas fa-link'}"></i>
                </a>
            \`).join('');
        }
        
        // Contact form
        document.getElementById('contactForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const btn = form.querySelector('.btn-submit');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> भेज रहे हैं...';
            btn.disabled = true;
            
            const data = {
                name: form.name.value,
                phone: form.phone.value,
                shift: form.shift.value
            };
            
            try {
                const res = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                alert(result.message || 'धन्यवाद! हम आपसे जल्द संपर्क करेंगे।');
                form.reset();
            } catch (e) {
                alert('कुछ गड़बड़ हुई। कृपया दोबारा प्रयास करें।');
            }
            
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
        
        // Scroll reveal
        function reveal() {
            document.querySelectorAll('.reveal').forEach(el => {
                const top = el.getBoundingClientRect().top;
                if (top < window.innerHeight - 100) {
                    el.classList.add('active');
                }
            });
        }
        
        // Navbar scroll effect
        window.addEventListener('scroll', () => {
            reveal();
            document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
        });
        
        // Smooth scroll
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
        
        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            loadSettings();
            loadSlides();
            loadGallery();
            loadSocialLinks();
            reveal();
        });
    </script>
</body>
</html>`)
})

// Admin Panel
app.get('/admin', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Panel - Drishti Digital Library</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <style>
        :root {
            --primary: #0a1628;
            --primary-light: #1e3a5f;
            --accent: #f59e0b;
            --accent-dark: #d97706;
            --light: #f8fafc;
            --white: #ffffff;
            --gray: #94a3b8;
            --danger: #ef4444;
            --success: #22c55e;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            background: var(--light);
            min-height: 100vh;
        }
        
        /* Login Page */
        .login-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
            padding: 20px;
        }
        .login-box {
            background: var(--white);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            width: 100%;
            max-width: 400px;
        }
        .login-box h1 {
            text-align: center;
            color: var(--primary);
            margin-bottom: 10px;
            font-size: 1.8rem;
        }
        .login-box p {
            text-align: center;
            color: var(--gray);
            margin-bottom: 30px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: var(--primary);
        }
        .form-group input {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e2e8f0;
            border-radius: 10px;
            font-size: 1rem;
            transition: all 0.3s;
            font-family: inherit;
        }
        .form-group input:focus {
            outline: none;
            border-color: var(--accent);
        }
        .btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            font-family: inherit;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(245, 158, 11, 0.4);
        }
        .error-msg {
            color: var(--danger);
            text-align: center;
            margin-top: 15px;
            display: none;
        }
        
        /* Dashboard */
        .dashboard {
            display: none;
        }
        .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            width: 260px;
            height: 100vh;
            background: var(--primary);
            padding: 20px;
            overflow-y: auto;
        }
        .sidebar-logo {
            color: white;
            font-size: 1.3rem;
            font-weight: 700;
            padding: 15px 0 30px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            margin-bottom: 20px;
        }
        .sidebar-logo span {
            color: var(--accent);
        }
        .nav-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 15px;
            color: var(--gray);
            text-decoration: none;
            border-radius: 10px;
            margin-bottom: 5px;
            transition: all 0.3s;
            cursor: pointer;
        }
        .nav-item:hover, .nav-item.active {
            background: rgba(255,255,255,0.1);
            color: white;
        }
        .nav-item i {
            width: 20px;
        }
        .main-content {
            margin-left: 260px;
            padding: 30px;
            min-height: 100vh;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
        }
        .header h2 {
            color: var(--primary);
            font-size: 1.5rem;
        }
        .logout-btn {
            background: var(--danger);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-family: inherit;
            font-weight: 500;
        }
        
        /* Tabs Content */
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        
        /* Cards */
        .card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        }
        .card h3 {
            color: var(--primary);
            margin-bottom: 20px;
            font-size: 1.1rem;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .card h3 i {
            color: var(--accent);
        }
        
        /* Form Styles */
        .form-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }
        .form-group input,
        .form-group textarea,
        .form-group select {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #e2e8f0;
            border-radius: 10px;
            font-size: 0.95rem;
            font-family: inherit;
        }
        .form-group textarea {
            resize: vertical;
            min-height: 100px;
        }
        .form-group input:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: var(--accent);
        }
        .btn-save {
            background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            font-family: inherit;
            margin-top: 15px;
        }
        .btn-save:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(245, 158, 11, 0.4);
        }
        
        /* List Items */
        .list-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 15px;
            background: var(--light);
            border-radius: 10px;
            margin-bottom: 10px;
        }
        .list-item-info {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .list-item img {
            width: 60px;
            height: 40px;
            object-fit: cover;
            border-radius: 8px;
        }
        .list-item-actions {
            display: flex;
            gap: 10px;
        }
        .btn-edit, .btn-delete {
            padding: 8px 15px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-family: inherit;
            font-size: 0.85rem;
        }
        .btn-edit {
            background: var(--primary-light);
            color: white;
        }
        .btn-delete {
            background: var(--danger);
            color: white;
        }
        .btn-add {
            background: var(--success);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-family: inherit;
            font-weight: 500;
            margin-bottom: 20px;
        }
        
        /* Contact List */
        .contact-item {
            background: var(--light);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 10px;
        }
        .contact-item strong {
            color: var(--primary);
        }
        .contact-item p {
            color: var(--gray);
            font-size: 0.9rem;
            margin-top: 5px;
        }
        
        /* Toast */
        .toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--success);
            color: white;
            padding: 15px 25px;
            border-radius: 10px;
            display: none;
            z-index: 9999;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        .toast.error {
            background: var(--danger);
        }
        
        /* Mobile */
        @media (max-width: 768px) {
            .sidebar {
                width: 100%;
                height: auto;
                position: relative;
            }
            .main-content {
                margin-left: 0;
            }
            .form-row {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <!-- Toast -->
    <div class="toast" id="toast"></div>
    
    <!-- Login Page -->
    <div class="login-container" id="loginPage">
        <div class="login-box">
            <h1><i class="fas fa-lock"></i> Admin Login</h1>
            <p>Drishti Digital Library Admin Panel</p>
            <form id="loginForm">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" id="username" placeholder="Enter username" required>
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="password" placeholder="Enter password" required>
                </div>
                <button type="submit" class="btn">
                    <i class="fas fa-sign-in-alt"></i> Login
                </button>
                <p class="error-msg" id="loginError">Invalid username or password</p>
            </form>
        </div>
    </div>
    
    <!-- Dashboard -->
    <div class="dashboard" id="dashboard">
        <div class="sidebar">
            <div class="sidebar-logo">DRISHTI <span>ADMIN</span></div>
            <a class="nav-item active" data-tab="general"><i class="fas fa-cog"></i> General Settings</a>
            <a class="nav-item" data-tab="slides"><i class="fas fa-images"></i> Hero Slides</a>
            <a class="nav-item" data-tab="gallery"><i class="fas fa-photo-video"></i> Gallery</a>
            <a class="nav-item" data-tab="social"><i class="fas fa-share-alt"></i> Social Links</a>
            <a class="nav-item" data-tab="contacts"><i class="fas fa-envelope"></i> Contact Forms</a>
            <a class="nav-item" data-tab="password"><i class="fas fa-key"></i> Change Password</a>
        </div>
        
        <div class="main-content">
            <div class="header">
                <h2 id="pageTitle">General Settings</h2>
                <button class="logout-btn" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</button>
            </div>
            
            <!-- General Settings -->
            <div class="tab-content active" id="tab-general">
                <div class="card">
                    <h3><i class="fas fa-store"></i> Website Information</h3>
                    <form id="settingsForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Site Name</label>
                                <input type="text" id="site_name" placeholder="Drishti Digital">
                            </div>
                            <div class="form-group">
                                <label>Logo URL</label>
                                <input type="url" id="logo_url" placeholder="https://example.com/logo.png">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Phone Number</label>
                                <input type="tel" id="phone" placeholder="9876543210">
                            </div>
                            <div class="form-group">
                                <label>WhatsApp Number</label>
                                <input type="tel" id="whatsapp" placeholder="9876543210">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Address</label>
                            <textarea id="address" placeholder="Full address..."></textarea>
                        </div>
                        <div class="form-group">
                            <label>Google Map Embed URL</label>
                            <input type="url" id="map_embed" placeholder="https://www.google.com/maps/embed?pb=...">
                        </div>
                        <button type="submit" class="btn-save"><i class="fas fa-save"></i> Save Settings</button>
                    </form>
                </div>
            </div>
            
            <!-- Hero Slides -->
            <div class="tab-content" id="tab-slides">
                <button class="btn-add" onclick="showAddSlide()"><i class="fas fa-plus"></i> Add New Slide</button>
                <div class="card">
                    <h3><i class="fas fa-images"></i> Manage Slides</h3>
                    <div id="slidesList"></div>
                </div>
                
                <!-- Add/Edit Slide Form -->
                <div class="card" id="slideForm" style="display:none;">
                    <h3><i class="fas fa-edit"></i> <span id="slideFormTitle">Add Slide</span></h3>
                    <input type="hidden" id="slideId">
                    <div class="form-group">
                        <label>Image URL</label>
                        <input type="url" id="slideImage" placeholder="https://example.com/slide.jpg">
                    </div>
                    <div class="form-group">
                        <label>Title</label>
                        <input type="text" id="slideTitle" placeholder="Slide title...">
                    </div>
                    <div class="form-group">
                        <label>Subtitle</label>
                        <input type="text" id="slideSubtitle" placeholder="Slide subtitle...">
                    </div>
                    <div class="form-group">
                        <label>Order</label>
                        <input type="number" id="slideOrder" value="1" min="1">
                    </div>
                    <button class="btn-save" onclick="saveSlide()"><i class="fas fa-save"></i> Save Slide</button>
                </div>
            </div>
            
            <!-- Gallery -->
            <div class="tab-content" id="tab-gallery">
                <button class="btn-add" onclick="showAddGallery()"><i class="fas fa-plus"></i> Add Image</button>
                <div class="card">
                    <h3><i class="fas fa-photo-video"></i> Gallery Images</h3>
                    <div id="galleryList"></div>
                </div>
                
                <!-- Add Gallery Form -->
                <div class="card" id="galleryForm" style="display:none;">
                    <h3><i class="fas fa-edit"></i> <span id="galleryFormTitle">Add Image</span></h3>
                    <input type="hidden" id="galleryId">
                    <div class="form-group">
                        <label>Image URL</label>
                        <input type="url" id="galleryImage" placeholder="https://example.com/image.jpg">
                    </div>
                    <div class="form-group">
                        <label>Caption (Optional)</label>
                        <input type="text" id="galleryCaption" placeholder="Image caption...">
                    </div>
                    <div class="form-group">
                        <label>Order</label>
                        <input type="number" id="galleryOrder" value="1" min="1">
                    </div>
                    <button class="btn-save" onclick="saveGallery()"><i class="fas fa-save"></i> Save Image</button>
                </div>
            </div>
            
            <!-- Social Links -->
            <div class="tab-content" id="tab-social">
                <button class="btn-add" onclick="showAddSocial()"><i class="fas fa-plus"></i> Add Social Link</button>
                <div class="card">
                    <h3><i class="fas fa-share-alt"></i> Social Media Links</h3>
                    <div id="socialList"></div>
                </div>
                
                <!-- Add Social Form -->
                <div class="card" id="socialForm" style="display:none;">
                    <h3><i class="fas fa-edit"></i> <span id="socialFormTitle">Add Social Link</span></h3>
                    <input type="hidden" id="socialId">
                    <div class="form-group">
                        <label>Platform</label>
                        <select id="socialPlatform">
                            <option value="whatsapp">WhatsApp</option>
                            <option value="instagram">Instagram</option>
                            <option value="facebook">Facebook</option>
                            <option value="youtube">YouTube</option>
                            <option value="twitter">Twitter</option>
                            <option value="telegram">Telegram</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>URL</label>
                        <input type="url" id="socialUrl" placeholder="https://...">
                    </div>
                    <button class="btn-save" onclick="saveSocial()"><i class="fas fa-save"></i> Save Link</button>
                </div>
            </div>
            
            <!-- Contact Forms -->
            <div class="tab-content" id="tab-contacts">
                <div class="card">
                    <h3><i class="fas fa-envelope"></i> Contact Form Submissions</h3>
                    <div id="contactsList"></div>
                </div>
            </div>
            
            <!-- Change Password -->
            <div class="tab-content" id="tab-password">
                <div class="card">
                    <h3><i class="fas fa-key"></i> Change Password</h3>
                    <form id="passwordForm">
                        <div class="form-group">
                            <label>Current Password</label>
                            <input type="password" id="currentPassword" required>
                        </div>
                        <div class="form-group">
                            <label>New Password</label>
                            <input type="password" id="newPassword" required>
                        </div>
                        <div class="form-group">
                            <label>Confirm New Password</label>
                            <input type="password" id="confirmPassword" required>
                        </div>
                        <button type="submit" class="btn-save"><i class="fas fa-save"></i> Update Password</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        let authToken = localStorage.getItem('adminToken');
        let currentUser = localStorage.getItem('adminUser');
        
        // Check auth on load
        if (authToken) {
            showDashboard();
        }
        
        // Toast notification
        function showToast(message, isError = false) {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast' + (isError ? ' error' : '');
            toast.style.display = 'block';
            setTimeout(() => toast.style.display = 'none', 3000);
        }
        
        // Login
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                
                if (data.success) {
                    authToken = data.token;
                    currentUser = username;
                    localStorage.setItem('adminToken', authToken);
                    localStorage.setItem('adminUser', username);
                    showDashboard();
                } else {
                    document.getElementById('loginError').style.display = 'block';
                }
            } catch (e) {
                document.getElementById('loginError').style.display = 'block';
            }
        });
        
        function showDashboard() {
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            loadSettings();
            loadSlides();
            loadGallery();
            loadSocialLinks();
            loadContacts();
        }
        
        function logout() {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminUser');
            location.reload();
        }
        
        // Tab Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const tab = item.dataset.tab;
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                item.classList.add('active');
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                document.getElementById('tab-' + tab).classList.add('active');
                document.getElementById('pageTitle').textContent = item.textContent.trim();
            });
        });
        
        // ============ Settings ============
        async function loadSettings() {
            try {
                const res = await fetch('/api/settings');
                const settings = await res.json();
                document.getElementById('site_name').value = settings.site_name || '';
                document.getElementById('logo_url').value = settings.logo_url || '';
                document.getElementById('phone').value = settings.phone || '';
                document.getElementById('whatsapp').value = settings.whatsapp || '';
                document.getElementById('address').value = settings.address || '';
                document.getElementById('map_embed').value = settings.map_embed || '';
            } catch (e) {
                console.log('Settings not found');
            }
        }
        
        document.getElementById('settingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const settings = {
                site_name: document.getElementById('site_name').value,
                logo_url: document.getElementById('logo_url').value,
                phone: document.getElementById('phone').value,
                whatsapp: document.getElementById('whatsapp').value,
                address: document.getElementById('address').value,
                map_embed: document.getElementById('map_embed').value
            };
            
            try {
                const res = await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settings)
                });
                showToast('Settings saved successfully!');
            } catch (e) {
                showToast('Failed to save settings', true);
            }
        });
        
        // ============ Slides ============
        let slides = [];
        
        async function loadSlides() {
            try {
                const res = await fetch('/api/slides');
                slides = await res.json();
                renderSlides();
            } catch (e) {
                slides = [];
                renderSlides();
            }
        }
        
        function renderSlides() {
            const list = document.getElementById('slidesList');
            if (slides.length === 0) {
                list.innerHTML = '<p style="color:#94a3b8;">No slides added yet.</p>';
                return;
            }
            list.innerHTML = slides.map(s => \`
                <div class="list-item">
                    <div class="list-item-info">
                        <img src="\${s.image_url}" alt="Slide">
                        <div>
                            <strong>\${s.title}</strong>
                            <p style="color:#94a3b8;font-size:0.85rem;">\${s.subtitle || ''}</p>
                        </div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn-edit" onclick="editSlide(\${s.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-delete" onclick="deleteSlide(\${s.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            \`).join('');
        }
        
        function showAddSlide() {
            document.getElementById('slideForm').style.display = 'block';
            document.getElementById('slideFormTitle').textContent = 'Add Slide';
            document.getElementById('slideId').value = '';
            document.getElementById('slideImage').value = '';
            document.getElementById('slideTitle').value = '';
            document.getElementById('slideSubtitle').value = '';
            document.getElementById('slideOrder').value = slides.length + 1;
        }
        
        function editSlide(id) {
            const slide = slides.find(s => s.id === id);
            if (!slide) return;
            document.getElementById('slideForm').style.display = 'block';
            document.getElementById('slideFormTitle').textContent = 'Edit Slide';
            document.getElementById('slideId').value = id;
            document.getElementById('slideImage').value = slide.image_url;
            document.getElementById('slideTitle').value = slide.title;
            document.getElementById('slideSubtitle').value = slide.subtitle || '';
            document.getElementById('slideOrder').value = slide.order_num || 1;
        }
        
        async function saveSlide() {
            const id = document.getElementById('slideId').value;
            const data = {
                image_url: document.getElementById('slideImage').value,
                title: document.getElementById('slideTitle').value,
                subtitle: document.getElementById('slideSubtitle').value,
                order_num: parseInt(document.getElementById('slideOrder').value) || 1
            };
            
            try {
                if (id) {
                    await fetch('/api/slides/' + id, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                } else {
                    await fetch('/api/slides', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                }
                showToast('Slide saved!');
                document.getElementById('slideForm').style.display = 'none';
                loadSlides();
            } catch (e) {
                showToast('Failed to save slide', true);
            }
        }
        
        async function deleteSlide(id) {
            if (!confirm('Delete this slide?')) return;
            try {
                await fetch('/api/slides/' + id, { method: 'DELETE' });
                showToast('Slide deleted!');
                loadSlides();
            } catch (e) {
                showToast('Failed to delete', true);
            }
        }
        
        // ============ Gallery ============
        let gallery = [];
        
        async function loadGallery() {
            try {
                const res = await fetch('/api/gallery');
                gallery = await res.json();
                renderGallery();
            } catch (e) {
                gallery = [];
                renderGallery();
            }
        }
        
        function renderGallery() {
            const list = document.getElementById('galleryList');
            if (gallery.length === 0) {
                list.innerHTML = '<p style="color:#94a3b8;">No images added yet.</p>';
                return;
            }
            list.innerHTML = gallery.map(g => \`
                <div class="list-item">
                    <div class="list-item-info">
                        <img src="\${g.image_url}" alt="Gallery">
                        <div>
                            <strong>\${g.caption || 'No caption'}</strong>
                        </div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn-edit" onclick="editGallery(\${g.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-delete" onclick="deleteGallery(\${g.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            \`).join('');
        }
        
        function showAddGallery() {
            document.getElementById('galleryForm').style.display = 'block';
            document.getElementById('galleryFormTitle').textContent = 'Add Image';
            document.getElementById('galleryId').value = '';
            document.getElementById('galleryImage').value = '';
            document.getElementById('galleryCaption').value = '';
            document.getElementById('galleryOrder').value = gallery.length + 1;
        }
        
        function editGallery(id) {
            const img = gallery.find(g => g.id === id);
            if (!img) return;
            document.getElementById('galleryForm').style.display = 'block';
            document.getElementById('galleryFormTitle').textContent = 'Edit Image';
            document.getElementById('galleryId').value = id;
            document.getElementById('galleryImage').value = img.image_url;
            document.getElementById('galleryCaption').value = img.caption || '';
            document.getElementById('galleryOrder').value = img.order_num || 1;
        }
        
        async function saveGallery() {
            const id = document.getElementById('galleryId').value;
            const data = {
                image_url: document.getElementById('galleryImage').value,
                caption: document.getElementById('galleryCaption').value,
                order_num: parseInt(document.getElementById('galleryOrder').value) || 1
            };
            
            try {
                if (id) {
                    await fetch('/api/gallery/' + id, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                } else {
                    await fetch('/api/gallery', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                }
                showToast('Image saved!');
                document.getElementById('galleryForm').style.display = 'none';
                loadGallery();
            } catch (e) {
                showToast('Failed to save image', true);
            }
        }
        
        async function deleteGallery(id) {
            if (!confirm('Delete this image?')) return;
            try {
                await fetch('/api/gallery/' + id, { method: 'DELETE' });
                showToast('Image deleted!');
                loadGallery();
            } catch (e) {
                showToast('Failed to delete', true);
            }
        }
        
        // ============ Social Links ============
        let socials = [];
        
        async function loadSocialLinks() {
            try {
                const res = await fetch('/api/social-links');
                socials = await res.json();
                renderSocials();
            } catch (e) {
                socials = [];
                renderSocials();
            }
        }
        
        function renderSocials() {
            const list = document.getElementById('socialList');
            if (socials.length === 0) {
                list.innerHTML = '<p style="color:#94a3b8;">No social links added yet.</p>';
                return;
            }
            const icons = {
                whatsapp: 'fab fa-whatsapp',
                instagram: 'fab fa-instagram',
                facebook: 'fab fa-facebook',
                youtube: 'fab fa-youtube',
                twitter: 'fab fa-twitter',
                telegram: 'fab fa-telegram'
            };
            list.innerHTML = socials.map(s => \`
                <div class="list-item">
                    <div class="list-item-info">
                        <i class="\${icons[s.platform] || 'fas fa-link'}" style="font-size:1.5rem;color:var(--accent);"></i>
                        <div>
                            <strong>\${s.platform.charAt(0).toUpperCase() + s.platform.slice(1)}</strong>
                            <p style="color:#94a3b8;font-size:0.8rem;">\${s.url}</p>
                        </div>
                    </div>
                    <div class="list-item-actions">
                        <button class="btn-edit" onclick="editSocial(\${s.id})"><i class="fas fa-edit"></i></button>
                        <button class="btn-delete" onclick="deleteSocial(\${s.id})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            \`).join('');
        }
        
        function showAddSocial() {
            document.getElementById('socialForm').style.display = 'block';
            document.getElementById('socialFormTitle').textContent = 'Add Social Link';
            document.getElementById('socialId').value = '';
            document.getElementById('socialPlatform').value = 'whatsapp';
            document.getElementById('socialUrl').value = '';
        }
        
        function editSocial(id) {
            const link = socials.find(s => s.id === id);
            if (!link) return;
            document.getElementById('socialForm').style.display = 'block';
            document.getElementById('socialFormTitle').textContent = 'Edit Social Link';
            document.getElementById('socialId').value = id;
            document.getElementById('socialPlatform').value = link.platform;
            document.getElementById('socialUrl').value = link.url;
        }
        
        async function saveSocial() {
            const id = document.getElementById('socialId').value;
            const data = {
                platform: document.getElementById('socialPlatform').value,
                url: document.getElementById('socialUrl').value
            };
            
            try {
                if (id) {
                    await fetch('/api/social-links/' + id, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                } else {
                    await fetch('/api/social-links', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                }
                showToast('Social link saved!');
                document.getElementById('socialForm').style.display = 'none';
                loadSocialLinks();
            } catch (e) {
                showToast('Failed to save', true);
            }
        }
        
        async function deleteSocial(id) {
            if (!confirm('Delete this social link?')) return;
            try {
                await fetch('/api/social-links/' + id, { method: 'DELETE' });
                showToast('Deleted!');
                loadSocialLinks();
            } catch (e) {
                showToast('Failed to delete', true);
            }
        }
        
        // ============ Contacts ============
        async function loadContacts() {
            try {
                const res = await fetch('/api/contact');
                const contacts = await res.json();
                const list = document.getElementById('contactsList');
                if (contacts.length === 0) {
                    list.innerHTML = '<p style="color:#94a3b8;">No submissions yet.</p>';
                    return;
                }
                list.innerHTML = contacts.map(c => \`
                    <div class="contact-item">
                        <strong>\${c.name}</strong> - \${c.phone}
                        <p>Shift: \${c.shift}</p>
                        <p style="font-size:0.8rem;color:#64748b;">\${new Date(c.created_at).toLocaleString()}</p>
                    </div>
                \`).join('');
            } catch (e) {
                document.getElementById('contactsList').innerHTML = '<p style="color:#94a3b8;">Error loading contacts.</p>';
            }
        }
        
        // ============ Change Password ============
        document.getElementById('passwordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (newPassword !== confirmPassword) {
                showToast('Passwords do not match!', true);
                return;
            }
            
            try {
                const res = await fetch('/api/admin/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: currentUser,
                        currentPassword,
                        newPassword
                    })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Password updated successfully!');
                    document.getElementById('passwordForm').reset();
                } else {
                    showToast(data.message || 'Failed to update password', true);
                }
            } catch (e) {
                showToast('Error updating password', true);
            }
        });
    </script>
</body>
</html>`)
})

// Terms and Conditions Page
app.get('/terms', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Terms & Conditions - Drishti Digital Library</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Outfit', sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.8; }
        .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
        h1 { color: #0a1628; margin-bottom: 30px; font-size: 2rem; border-bottom: 3px solid #f59e0b; padding-bottom: 15px; }
        h2 { color: #1e3a5f; margin: 30px 0 15px; font-size: 1.3rem; }
        p { margin-bottom: 15px; color: #475569; }
        ul { margin: 15px 0 15px 25px; }
        li { margin-bottom: 10px; color: #475569; }
        .back-link { display: inline-block; margin-bottom: 30px; color: #f59e0b; text-decoration: none; font-weight: 500; }
        .back-link:hover { text-decoration: underline; }
        .last-updated { color: #94a3b8; font-size: 0.9rem; margin-top: 40px; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Home</a>
        <h1>Terms & Conditions</h1>
        
        <p>Welcome to Drishti Digital Library. By accessing and using our services, you agree to be bound by these Terms and Conditions.</p>
        
        <h2>1. Services</h2>
        <p>Drishti Digital Library provides self-study center facilities including:</p>
        <ul>
            <li>Air-conditioned study space</li>
            <li>High-speed WiFi connectivity</li>
            <li>Reading materials and newspapers</li>
            <li>CCTV monitored secure environment</li>
            <li>RO purified drinking water</li>
        </ul>
        
        <h2>2. Membership & Booking</h2>
        <ul>
            <li>Memberships are available on monthly, quarterly, and yearly basis</li>
            <li>Seat booking is subject to availability</li>
            <li>Members must carry valid ID proof at all times</li>
            <li>Membership is non-transferable</li>
        </ul>
        
        <h2>3. Payment Terms</h2>
        <ul>
            <li>All fees must be paid in advance</li>
            <li>We accept online payments via UPI, Cards, and Net Banking through Cashfree Payment Gateway</li>
            <li>Prices are subject to change with prior notice</li>
            <li>GST and applicable taxes are included in the displayed prices</li>
        </ul>
        
        <h2>4. Rules & Conduct</h2>
        <ul>
            <li>Maintain silence and discipline in the study area</li>
            <li>Mobile phones must be kept on silent mode</li>
            <li>No food or beverages inside the study hall (except water)</li>
            <li>Personal belongings are the responsibility of the member</li>
            <li>Any damage to property will be charged to the member</li>
        </ul>
        
        <h2>5. Cancellation & Refunds</h2>
        <p>Please refer to our <a href="/refund" style="color:#f59e0b;">Refund Policy</a> for detailed information about cancellations and refunds.</p>
        
        <h2>6. Privacy</h2>
        <p>Your privacy is important to us. Please review our <a href="/privacy" style="color:#f59e0b;">Privacy Policy</a> for information on how we collect and use your data.</p>
        
        <h2>7. Liability</h2>
        <ul>
            <li>Drishti Digital Library is not liable for any loss or theft of personal belongings</li>
            <li>We reserve the right to modify operating hours during festivals and emergencies</li>
            <li>Members violating rules may have their membership terminated without refund</li>
        </ul>
        
        <h2>8. Contact Information</h2>
        <p>For any queries regarding these terms, please contact us:</p>
        <ul>
            <li>Phone: +91 98765 43210</li>
            <li>WhatsApp: +91 98765 43210</li>
            <li>Address: Sakchi Main Road, Jamshedpur, Jharkhand - 831001</li>
        </ul>
        
        <p class="last-updated">Last Updated: January 2026</p>
    </div>
</body>
</html>`)
})

// Privacy Policy Page
app.get('/privacy', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Privacy Policy - Drishti Digital Library</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Outfit', sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.8; }
        .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
        h1 { color: #0a1628; margin-bottom: 30px; font-size: 2rem; border-bottom: 3px solid #f59e0b; padding-bottom: 15px; }
        h2 { color: #1e3a5f; margin: 30px 0 15px; font-size: 1.3rem; }
        p { margin-bottom: 15px; color: #475569; }
        ul { margin: 15px 0 15px 25px; }
        li { margin-bottom: 10px; color: #475569; }
        .back-link { display: inline-block; margin-bottom: 30px; color: #f59e0b; text-decoration: none; font-weight: 500; }
        .back-link:hover { text-decoration: underline; }
        .last-updated { color: #94a3b8; font-size: 0.9rem; margin-top: 40px; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Home</a>
        <h1>Privacy Policy</h1>
        
        <p>At Drishti Digital Library, we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your personal information.</p>
        
        <h2>1. Information We Collect</h2>
        <p>We collect the following types of information:</p>
        <ul>
            <li><strong>Personal Information:</strong> Name, phone number, email address when you register or book a seat</li>
            <li><strong>Identity Information:</strong> ID proof details for membership verification</li>
            <li><strong>Payment Information:</strong> Transaction details processed through secure payment gateways</li>
            <li><strong>CCTV Footage:</strong> For security purposes within our premises</li>
        </ul>
        
        <h2>2. How We Use Your Information</h2>
        <ul>
            <li>To process your membership and seat bookings</li>
            <li>To communicate important updates and offers</li>
            <li>To process payments securely</li>
            <li>To improve our services and facilities</li>
            <li>To ensure security of our premises</li>
        </ul>
        
        <h2>3. Data Security</h2>
        <p>We implement appropriate security measures to protect your personal information:</p>
        <ul>
            <li>All payment transactions are processed through Cashfree Payment Gateway with encryption</li>
            <li>We do not store credit card/debit card details on our servers</li>
            <li>Access to personal data is restricted to authorized personnel only</li>
            <li>CCTV footage is stored securely and accessed only for security purposes</li>
        </ul>
        
        <h2>4. Third-Party Services</h2>
        <p>We use the following third-party services:</p>
        <ul>
            <li><strong>Cashfree Payments:</strong> For processing online payments. Their privacy policy applies to payment data.</li>
            <li><strong>Supabase:</strong> For secure data storage with industry-standard encryption.</li>
        </ul>
        
        <h2>5. Data Retention</h2>
        <ul>
            <li>Member information is retained for the duration of membership plus 1 year</li>
            <li>Payment records are kept as per legal requirements (typically 7 years)</li>
            <li>CCTV footage is retained for 30 days unless required for investigation</li>
        </ul>
        
        <h2>6. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
            <li>Access your personal information we hold</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data (subject to legal requirements)</li>
            <li>Opt-out of marketing communications</li>
        </ul>
        
        <h2>7. Contact Us</h2>
        <p>For any privacy-related queries or concerns, please contact:</p>
        <ul>
            <li>Phone: +91 98765 43210</li>
            <li>WhatsApp: +91 98765 43210</li>
            <li>Address: Sakchi Main Road, Jamshedpur, Jharkhand - 831001</li>
        </ul>
        
        <p class="last-updated">Last Updated: January 2026</p>
    </div>
</body>
</html>`)
})

// Refund Policy Page
app.get('/refund', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Refund & Cancellation Policy - Drishti Digital Library</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Outfit', sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.8; }
        .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
        h1 { color: #0a1628; margin-bottom: 30px; font-size: 2rem; border-bottom: 3px solid #f59e0b; padding-bottom: 15px; }
        h2 { color: #1e3a5f; margin: 30px 0 15px; font-size: 1.3rem; }
        p { margin-bottom: 15px; color: #475569; }
        ul { margin: 15px 0 15px 25px; }
        li { margin-bottom: 10px; color: #475569; }
        .back-link { display: inline-block; margin-bottom: 30px; color: #f59e0b; text-decoration: none; font-weight: 500; }
        .back-link:hover { text-decoration: underline; }
        .last-updated { color: #94a3b8; font-size: 0.9rem; margin-top: 40px; }
        .highlight { background: #fef3c7; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #f59e0b; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
        th { background: #0a1628; color: white; }
        tr:nth-child(even) { background: #f1f5f9; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Home</a>
        <h1>Refund & Cancellation Policy</h1>
        
        <p>This Refund and Cancellation Policy outlines the terms under which refunds and cancellations are processed at Drishti Digital Library.</p>
        
        <h2>1. Membership Cancellation</h2>
        <table>
            <tr>
                <th>Cancellation Time</th>
                <th>Refund Amount</th>
            </tr>
            <tr>
                <td>Within 24 hours of purchase</td>
                <td>Full refund (100%)</td>
            </tr>
            <tr>
                <td>Within 3 days of purchase</td>
                <td>90% refund</td>
            </tr>
            <tr>
                <td>Within 7 days of purchase</td>
                <td>75% refund</td>
            </tr>
            <tr>
                <td>After 7 days</td>
                <td>No refund</td>
            </tr>
        </table>
        
        <div class="highlight">
            <strong>Note:</strong> Refunds are calculated based on unused days of membership. Any promotional discounts availed will be adjusted in the refund amount.
        </div>
        
        <h2>2. How to Request a Refund</h2>
        <p>To request a refund, please follow these steps:</p>
        <ul>
            <li>Contact us via phone or WhatsApp at +91 98765 43210</li>
            <li>Provide your membership ID and reason for cancellation</li>
            <li>Submit a written request (can be via WhatsApp)</li>
            <li>Our team will verify and process your request within 3-5 business days</li>
        </ul>
        
        <h2>3. Refund Processing Time</h2>
        <ul>
            <li>Once approved, refunds will be processed within 5-7 business days</li>
            <li>Refunds will be credited to the original payment method</li>
            <li>For UPI/Net Banking: 2-3 business days</li>
            <li>For Credit/Debit Cards: 5-7 business days (depends on bank)</li>
        </ul>
        
        <h2>4. Non-Refundable Situations</h2>
        <p>Refunds will NOT be provided in the following cases:</p>
        <ul>
            <li>Membership terminated due to violation of rules</li>
            <li>No-show without prior intimation</li>
            <li>After using more than 50% of the membership period</li>
            <li>Special promotional or discounted memberships (unless specified)</li>
        </ul>
        
        <h2>5. Shift Changes</h2>
        <ul>
            <li>Shift changes are allowed once per month at no additional cost</li>
            <li>Subject to availability in the requested shift</li>
            <li>Must be requested at least 24 hours in advance</li>
        </ul>
        
        <h2>6. Payment Gateway</h2>
        <p>All online payments are processed securely through <strong>Cashfree Payments</strong>. In case of any payment failure or double deduction:</p>
        <ul>
            <li>Contact our support immediately with transaction details</li>
            <li>Provide bank statement if requested</li>
            <li>Refund for failed transactions is processed within 24-48 hours</li>
        </ul>
        
        <h2>7. Contact for Refunds</h2>
        <ul>
            <li><strong>Phone:</strong> +91 98765 43210</li>
            <li><strong>WhatsApp:</strong> +91 98765 43210</li>
            <li><strong>Timing:</strong> 9:00 AM - 8:00 PM (Mon-Sat)</li>
            <li><strong>Address:</strong> Sakchi Main Road, Jamshedpur, Jharkhand - 831001</li>
        </ul>
        
        <p class="last-updated">Last Updated: January 2026</p>
    </div>
</body>
</html>`)
})

// Contact Page
app.get('/contact', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contact Us - Drishti Digital Library</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Outfit', sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.8; }
        .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
        h1 { color: #0a1628; margin-bottom: 30px; font-size: 2rem; border-bottom: 3px solid #f59e0b; padding-bottom: 15px; }
        .back-link { display: inline-block; margin-bottom: 30px; color: #f59e0b; text-decoration: none; font-weight: 500; }
        .back-link:hover { text-decoration: underline; }
        .contact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .contact-card { background: white; padding: 25px; border-radius: 15px; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .contact-card i { font-size: 2rem; color: #f59e0b; margin-bottom: 15px; }
        .contact-card h3 { color: #0a1628; margin-bottom: 10px; }
        .contact-card p { color: #475569; }
        .contact-card a { color: #1e3a5f; text-decoration: none; font-weight: 500; }
        .contact-card a:hover { color: #f59e0b; }
        .map-container { border-radius: 15px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        .map-container iframe { width: 100%; height: 350px; border: none; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/" class="back-link">← Back to Home</a>
        <h1>Contact Us</h1>
        
        <div class="contact-grid">
            <div class="contact-card">
                <i class="fas fa-phone"></i>
                <h3>Phone</h3>
                <p><a href="tel:+919876543210">+91 98765 43210</a></p>
            </div>
            <div class="contact-card">
                <i class="fab fa-whatsapp"></i>
                <h3>WhatsApp</h3>
                <p><a href="https://wa.me/919876543210" target="_blank">+91 98765 43210</a></p>
            </div>
            <div class="contact-card">
                <i class="fas fa-clock"></i>
                <h3>Hours</h3>
                <p>6:00 AM - 10:00 PM<br>All Days Open</p>
            </div>
            <div class="contact-card">
                <i class="fas fa-map-marker-alt"></i>
                <h3>Address</h3>
                <p>Sakchi Main Road,<br>Jamshedpur, Jharkhand - 831001</p>
            </div>
        </div>
        
        <h2 style="color:#0a1628; margin-bottom:20px;">Find Us on Map</h2>
        <div class="map-container">
            <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m13!1d58842.16434850721!2d86.1558223405761!3d22.815918731175654!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39f5e31989f0e2b3%3A0x4560124953c80051!2sSakchi%2C%20Jamshedpur%2C%20Jharkhand!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin" allowfullscreen="" loading="lazy"></iframe>
        </div>
    </div>
</body>
</html>`)
})

export default app
