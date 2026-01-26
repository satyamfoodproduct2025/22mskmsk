import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-pages'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use('/static/*', serveStatic())

// Supabase Helper
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

// Admin Auth
app.post('/api/admin/login', async (c) => {
  try {
    const { username, password } = await c.req.json()
    const admins = await supabaseRequest(c.env, `admin_users?username=eq.${username}&select=*`)
    if (admins.length === 0 || admins[0].password !== password) {
      return c.json({ success: false, message: 'Invalid credentials' }, 401)
    }
    const token = btoa(`${username}:${Date.now()}`)
    return c.json({ success: true, token, admin: { id: admins[0].id, username } })
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

// Settings API
app.get('/api/settings', async (c) => {
  try {
    const settings = await supabaseRequest(c.env, 'site_settings?select=*')
    const settingsObj: Record<string, string> = {}
    settings.forEach((s: any) => { settingsObj[s.key] = s.value })
    return c.json(settingsObj)
  } catch (error: any) {
    return c.json({ error: error.message }, 500)
  }
})

app.post('/api/settings', async (c) => {
  try {
    const updates = await c.req.json()
    for (const [key, value] of Object.entries(updates)) {
      const existing = await supabaseRequest(c.env, `site_settings?key=eq.${key}&select=id`).catch(() => [])
      if (existing.length > 0) {
        await supabaseRequest(c.env, `site_settings?key=eq.${key}`, {
          method: 'PATCH', body: JSON.stringify({ value })
        })
      } else {
        await supabaseRequest(c.env, 'site_settings', {
          method: 'POST', body: JSON.stringify({ key, value })
        })
      }
    }
    return c.json({ success: true })
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500)
  }
})

// Slides API
app.get('/api/slides', async (c) => {
  try {
    return c.json(await supabaseRequest(c.env, 'hero_slides?select=*&order=order_num.asc'))
  } catch { return c.json([], 200) }
})

app.post('/api/slides', async (c) => {
  try {
    const slide = await c.req.json()
    const result = await supabaseRequest(c.env, 'hero_slides', { method: 'POST', body: JSON.stringify(slide) })
    return c.json(result[0])
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

app.put('/api/slides/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await supabaseRequest(c.env, `hero_slides?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(await c.req.json()) })
    return c.json({ success: true })
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

app.delete('/api/slides/:id', async (c) => {
  try {
    await supabaseRequest(c.env, `hero_slides?id=eq.${c.req.param('id')}`, { method: 'DELETE' })
    return c.json({ success: true })
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

// Social Links API
app.get('/api/social-links', async (c) => {
  try { return c.json(await supabaseRequest(c.env, 'social_links?select=*')) }
  catch { return c.json([], 200) }
})

app.post('/api/social-links', async (c) => {
  try {
    const result = await supabaseRequest(c.env, 'social_links', { method: 'POST', body: JSON.stringify(await c.req.json()) })
    return c.json(result[0])
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

app.put('/api/social-links/:id', async (c) => {
  try {
    await supabaseRequest(c.env, `social_links?id=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(await c.req.json()) })
    return c.json({ success: true })
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

app.delete('/api/social-links/:id', async (c) => {
  try {
    await supabaseRequest(c.env, `social_links?id=eq.${c.req.param('id')}`, { method: 'DELETE' })
    return c.json({ success: true })
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

// Contact Form
app.post('/api/contact', async (c) => {
  try {
    const data = await c.req.json()
    await supabaseRequest(c.env, 'contact_submissions', {
      method: 'POST',
      body: JSON.stringify({ name: data.name, phone: data.phone, shift: data.shift, message: data.message || '' })
    })
    return c.json({ success: true, message: 'धन्यवाद! हम आपसे जल्द संपर्क करेंगे।' })
  } catch (error: any) { return c.json({ success: false, message: error.message }, 500) }
})

app.get('/api/contact', async (c) => {
  try { return c.json(await supabaseRequest(c.env, 'contact_submissions?select=*&order=created_at.desc')) }
  catch { return c.json([], 200) }
})

// Gallery API
app.get('/api/gallery', async (c) => {
  try { return c.json(await supabaseRequest(c.env, 'gallery_images?select=*&order=order_num.asc')) }
  catch { return c.json([], 200) }
})

app.post('/api/gallery', async (c) => {
  try {
    const result = await supabaseRequest(c.env, 'gallery_images', { method: 'POST', body: JSON.stringify(await c.req.json()) })
    return c.json(result[0])
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

app.put('/api/gallery/:id', async (c) => {
  try {
    await supabaseRequest(c.env, `gallery_images?id=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(await c.req.json()) })
    return c.json({ success: true })
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

app.delete('/api/gallery/:id', async (c) => {
  try {
    await supabaseRequest(c.env, `gallery_images?id=eq.${c.req.param('id')}`, { method: 'DELETE' })
    return c.json({ success: true })
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

// Pricing Plans API
app.get('/api/pricing', async (c) => {
  try { return c.json(await supabaseRequest(c.env, 'pricing_plans?select=*&order=order_num.asc')) }
  catch { return c.json([], 200) }
})

app.post('/api/pricing', async (c) => {
  try {
    const result = await supabaseRequest(c.env, 'pricing_plans', { method: 'POST', body: JSON.stringify(await c.req.json()) })
    return c.json(result[0])
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

app.put('/api/pricing/:id', async (c) => {
  try {
    await supabaseRequest(c.env, `pricing_plans?id=eq.${c.req.param('id')}`, { method: 'PATCH', body: JSON.stringify(await c.req.json()) })
    return c.json({ success: true })
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

app.delete('/api/pricing/:id', async (c) => {
  try {
    await supabaseRequest(c.env, `pricing_plans?id=eq.${c.req.param('id')}`, { method: 'DELETE' })
    return c.json({ success: true })
  } catch (error: any) { return c.json({ error: error.message }, 500) }
})

// Homepage
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="hi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Drishti Digital Library | Self Study Center</title>
    <meta name="description" content="Drishti Digital Library - Premium Self Study Center with AC, WiFi, CCTV and peaceful environment.">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
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
            --dark-gray: #475569;
            --gradient: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            --gradient-dark: linear-gradient(135deg, #0a1628 0%, #1e3a5f 100%);
            --whatsapp: #25d366;
            --shadow: 0 10px 40px rgba(0,0,0,0.15);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Outfit', sans-serif; background: var(--light); color: var(--primary); overflow-x: hidden; line-height: 1.6; }
        
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
        .reveal { opacity: 0; transform: translateY(40px); transition: all 0.8s ease; }
        .reveal.active { opacity: 1; transform: translateY(0); }
        
        /* Navigation */
        nav { background: rgba(255,255,255,0.98); backdrop-filter: blur(20px); padding: 12px 5%; display: flex; justify-content: space-between; align-items: center; position: fixed; width: 100%; top: 0; z-index: 1000; box-shadow: 0 2px 20px rgba(0,0,0,0.08); }
        nav.scrolled { padding: 8px 5%; }
        .logo-container { display: flex; align-items: center; gap: 10px; }
        .logo-img { width: 45px; height: 45px; border-radius: 10px; object-fit: cover; }
        .logo-text { font-size: 1.3rem; font-weight: 700; background: var(--gradient-dark); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1.2; }
        .logo-text span { display: block; font-size: 0.7rem; font-weight: 500; color: var(--accent); -webkit-text-fill-color: var(--accent); }
        .nav-links { display: flex; align-items: center; gap: 10px; }
        .nav-link { text-decoration: none; color: var(--primary); font-weight: 500; font-size: 0.85rem; padding: 8px 12px; border-radius: 25px; transition: all 0.3s; }
        .nav-link:hover { background: var(--light); color: var(--accent); }
        .nav-cta { background: var(--gradient); color: white !important; box-shadow: 0 4px 15px rgba(245,158,11,0.4); }
        .nav-login { background: var(--primary); color: white !important; }
        
        /* Hero */
        .hero-container { position: relative; width: 100%; height: 100vh; min-height: 550px; overflow: hidden; }
        .slide { position: absolute; width: 100%; height: 100%; opacity: 0; transition: opacity 1.5s; background-size: cover; background-position: center; }
        .slide.active { opacity: 1; }
        .slide-overlay { position: absolute; inset: 0; background: linear-gradient(135deg, rgba(10,22,40,0.85), rgba(30,58,95,0.7)); }
        .slide-content { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 20px; color: white; }
        .slide-content h1 { font-size: clamp(1.8rem, 5vw, 3.2rem); font-weight: 800; margin-bottom: 15px; }
        .slide-content p { font-size: clamp(0.9rem, 2.5vw, 1.2rem); max-width: 600px; margin-bottom: 25px; opacity: 0.95; }
        .hero-btn { display: inline-flex; align-items: center; gap: 10px; background: var(--gradient); color: white; padding: 15px 30px; border-radius: 50px; text-decoration: none; font-weight: 600; box-shadow: 0 8px 30px rgba(245,158,11,0.4); transition: all 0.3s; }
        .hero-btn:hover { transform: translateY(-3px); }
        .slide-indicators { position: absolute; bottom: 25px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; z-index: 10; }
        .indicator { width: 12px; height: 12px; border-radius: 50%; background: rgba(255,255,255,0.4); cursor: pointer; transition: all 0.3s; }
        .indicator.active { background: var(--accent); width: 35px; border-radius: 6px; }
        
        /* Section */
        .section { padding: 60px 5%; }
        .section-dark { background: var(--primary); color: white; }
        .section-header { text-align: center; margin-bottom: 40px; }
        .section-header h2 { font-size: clamp(1.5rem, 4vw, 2.2rem); font-weight: 700; margin-bottom: 10px; position: relative; display: inline-block; }
        .section-header h2::after { content: ''; position: absolute; bottom: -8px; left: 50%; transform: translateX(-50%); width: 50px; height: 4px; background: var(--gradient); border-radius: 2px; }
        .section-header p { color: var(--dark-gray); font-size: 0.95rem; max-width: 500px; margin: 15px auto 0; }
        .section-dark .section-header p { color: var(--gray); }
        
        /* Grid */
        .grid-2col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; max-width: 800px; margin: 0 auto; }
        .card { background: var(--white); padding: 20px 12px; border-radius: 16px; text-align: center; transition: all 0.4s; border: 1px solid rgba(0,0,0,0.05); }
        .card:hover { transform: translateY(-5px); box-shadow: var(--shadow); }
        .card-icon { width: 50px; height: 50px; border-radius: 12px; background: linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.1)); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
        .card-icon i { font-size: 1.3rem; background: var(--gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .card h3 { font-size: 0.9rem; font-weight: 600; color: var(--primary); margin-bottom: 4px; }
        .card p { font-size: 0.8rem; color: var(--gray); }
        
        /* Pricing */
        .pricing-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; max-width: 700px; margin: 0 auto; }
        .pricing-card { background: var(--white); border-radius: 20px; padding: 25px 15px; text-align: center; position: relative; transition: all 0.3s; border: 2px solid transparent; }
        .pricing-card.popular { background: var(--gradient); color: white; transform: scale(1.02); }
        .pricing-card.popular .pricing-features li { border-color: rgba(255,255,255,0.2); }
        .pricing-badge { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: var(--primary); color: white; padding: 4px 15px; border-radius: 20px; font-size: 0.7rem; font-weight: 600; }
        .pricing-card h3 { font-size: 1.1rem; font-weight: 700; margin-bottom: 8px; }
        .pricing-price { font-size: 2.5rem; font-weight: 800; margin: 10px 0; }
        .pricing-price span { font-size: 0.9rem; font-weight: 400; opacity: 0.8; }
        .pricing-features { list-style: none; margin: 15px 0; text-align: left; }
        .pricing-features li { padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.08); font-size: 0.85rem; display: flex; align-items: center; gap: 8px; }
        .pricing-features li i { color: #22c55e; font-size: 0.8rem; }
        .pricing-card.popular .pricing-features li i { color: white; }
        .pricing-btn { display: block; background: var(--primary); color: white; padding: 12px; border-radius: 10px; text-decoration: none; font-weight: 600; margin-top: 15px; transition: all 0.3s; }
        .pricing-card.popular .pricing-btn { background: white; color: var(--primary); }
        .pricing-btn:hover { transform: translateY(-2px); }
        
        /* Full Day Card */
        .pricing-full { grid-column: span 2; }
        
        /* Gallery */
        .gallery-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; max-width: 900px; margin: 0 auto; }
        .gallery-item { height: 160px; border-radius: 12px; overflow: hidden; position: relative; }
        .gallery-item img { width: 100%; height: 100%; object-fit: cover; transition: all 0.5s; }
        .gallery-item:hover img { transform: scale(1.1); }
        
        /* Booking */
        .booking-container { display: grid; grid-template-columns: 1fr 1fr; gap: 0; background: var(--white); border-radius: 20px; overflow: hidden; box-shadow: var(--shadow); max-width: 900px; margin: 0 auto; }
        .booking-info { background: var(--gradient-dark); color: white; padding: 35px 25px; }
        .booking-info h3 { font-size: 1.4rem; margin-bottom: 12px; }
        .booking-info p { opacity: 0.9; margin-bottom: 20px; font-size: 0.9rem; }
        .booking-features { list-style: none; }
        .booking-features li { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 0.85rem; }
        .booking-features li i { color: var(--accent); }
        .booking-form { padding: 35px 25px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; font-size: 0.8rem; font-weight: 500; color: var(--dark-gray); margin-bottom: 5px; }
        .form-group input, .form-group select { width: 100%; padding: 11px 14px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 0.9rem; font-family: inherit; }
        .form-group input:focus, .form-group select:focus { outline: none; border-color: var(--accent); }
        .btn-submit { width: 100%; padding: 13px; background: var(--gradient); color: white; border: none; border-radius: 10px; font-size: 0.95rem; font-weight: 600; cursor: pointer; font-family: inherit; }
        
        /* Map */
        .map-section { padding: 0 5%; }
        .map-container { border-radius: 20px 20px 0 0; overflow: hidden; box-shadow: 0 -10px 40px rgba(0,0,0,0.1); }
        .map-container iframe { width: 100%; height: 300px; border: none; }
        
        /* Footer */
        footer { background: var(--primary); color: white; padding: 40px 5% 20px; }
        .footer-content { max-width: 1200px; margin: 0 auto; text-align: center; }
        .footer-logo { font-size: 1.4rem; font-weight: 700; margin-bottom: 8px; }
        .footer-logo span { color: var(--accent); }
        .footer-address { color: var(--gray); margin-bottom: 20px; font-size: 0.9rem; line-height: 1.8; }
        .social-links { display: flex; justify-content: center; gap: 12px; margin-bottom: 25px; }
        .social-link { width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; color: white; text-decoration: none; transition: all 0.3s; }
        .social-link.whatsapp { background: #25d366; }
        .social-link.instagram { background: #e1306c; }
        .social-link.facebook { background: #1877f2; }
        .social-link.youtube { background: #ff0000; }
        .social-link:hover { transform: translateY(-4px) scale(1.1); }
        .footer-links { display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; margin-bottom: 20px; }
        .footer-links a { color: var(--gray); text-decoration: none; font-size: 0.8rem; }
        .footer-links a:hover { color: var(--accent); }
        .copyright { color: var(--gray); font-size: 0.8rem; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); }
        
        /* WhatsApp Float */
        .whatsapp-float { position: fixed; bottom: 20px; right: 20px; width: 55px; height: 55px; background: #25d366; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; text-decoration: none; box-shadow: 0 4px 20px rgba(37,211,102,0.4); z-index: 999; animation: pulse 2s infinite; }
        
        /* Mobile */
        @media (max-width: 768px) {
            nav { padding: 10px 4%; }
            .logo-img { width: 36px; height: 36px; }
            .logo-text { font-size: 1rem; }
            .logo-text span { font-size: 0.55rem; }
            .nav-links { gap: 6px; }
            .nav-link { font-size: 0.7rem; padding: 6px 8px; }
            .section { padding: 45px 4%; }
            .grid-2col, .pricing-grid, .gallery-grid { gap: 10px; }
            .card { padding: 15px 10px; border-radius: 12px; }
            .card-icon { width: 42px; height: 42px; margin-bottom: 10px; }
            .card-icon i { font-size: 1.1rem; }
            .card h3 { font-size: 0.8rem; }
            .card p { font-size: 0.7rem; }
            .pricing-card { padding: 20px 12px; border-radius: 15px; }
            .pricing-card h3 { font-size: 0.95rem; }
            .pricing-price { font-size: 2rem; }
            .pricing-features li { font-size: 0.75rem; padding: 6px 0; }
            .pricing-btn { padding: 10px; font-size: 0.85rem; }
            .gallery-item { height: 130px; }
            .booking-container { grid-template-columns: 1fr; }
            .booking-info, .booking-form { padding: 25px 20px; }
            .map-container iframe { height: 250px; }
            .whatsapp-float { width: 50px; height: 50px; font-size: 22px; }
        }
        @media (max-width: 400px) {
            .nav-link:not(.nav-cta):not(.nav-login) { display: none; }
            .pricing-full { grid-column: span 1; }
        }
    </style>
</head>
<body>
    <a href="#" id="whatsappFloat" class="whatsapp-float" target="_blank"><i class="fab fa-whatsapp"></i></a>
    
    <nav id="navbar">
        <div class="logo-container">
            <img src="https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=100&h=100&fit=crop" alt="Logo" class="logo-img" id="navLogo">
            <div class="logo-text"><span id="siteName">DRISHTI DIGITAL</span>LIBRARY</div>
        </div>
        <div class="nav-links">
            <a href="#pricing" class="nav-link">Pricing</a>
            <a href="#facilities" class="nav-link">Facilities</a>
            <a href="#" class="nav-link nav-login" id="loginBtn"><i class="fas fa-user"></i> Login</a>
            <a href="tel:+919876543210" class="nav-link nav-cta" id="navPhone"><i class="fas fa-phone"></i> Call</a>
        </div>
    </nav>
    
    <div class="hero-container" id="heroSlider"></div>
    
    <section class="section reveal" id="shifts">
        <div class="section-header"><h2>हमारी शिफ्ट्स</h2><p>अपनी सुविधा अनुसार शिफ्ट चुनें</p></div>
        <div class="grid-2col">
            <div class="card"><div class="card-icon"><i class="fas fa-coffee"></i></div><h3>06:00 - 10:00 AM</h3><p>सुबह की ताज़गी</p></div>
            <div class="card"><div class="card-icon"><i class="fas fa-sun"></i></div><h3>10:00 - 02:00 PM</h3><p>दिन का जोश</p></div>
            <div class="card"><div class="card-icon"><i class="fas fa-cloud-sun"></i></div><h3>02:00 - 06:00 PM</h3><p>शाम की एकाग्रता</p></div>
            <div class="card"><div class="card-icon"><i class="fas fa-moon"></i></div><h3>06:00 - 10:00 PM</h3><p>रात का सुकून</p></div>
        </div>
    </section>
    
    <section class="section reveal" id="facilities" style="background:white;">
        <div class="section-header"><h2>प्रीमियम सुविधाएँ</h2><p>आधुनिक सुविधाओं से लैस</p></div>
        <div class="grid-2col">
            <div class="card"><div class="card-icon"><i class="fas fa-video"></i></div><h3>CCTV Security</h3><p>24x7 निगरानी</p></div>
            <div class="card"><div class="card-icon"><i class="fas fa-newspaper"></i></div><h3>Newspapers</h3><p>दैनिक अखबार</p></div>
            <div class="card"><div class="card-icon"><i class="fas fa-bolt"></i></div><h3>Power Backup</h3><p>निर्बाध बिजली</p></div>
            <div class="card"><div class="card-icon"><i class="fas fa-tint"></i></div><h3>RO Water</h3><p>शुद्ध पेयजल</p></div>
        </div>
    </section>
    
    <section class="section section-dark reveal" id="pricing">
        <div class="section-header"><h2>हमारी कीमतें</h2><p>किफायती दामों में बेहतरीन सुविधाएं</p></div>
        <div class="pricing-grid" id="pricingGrid"></div>
    </section>
    
    <section class="section reveal" id="gallery">
        <div class="section-header"><h2>लाइब्रेरी की झलक</h2><p>हमारे स्टडी सेंटर की तस्वीरें</p></div>
        <div class="gallery-grid" id="galleryGrid"></div>
    </section>
    
    <section class="section reveal" id="booking" style="background:white;">
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
                    <div class="form-group"><label>आपका पूरा नाम</label><input type="text" name="name" placeholder="अपना नाम लिखें" required></div>
                    <div class="form-group"><label>मोबाइल नंबर</label><input type="tel" name="phone" placeholder="10 अंक का मोबाइल नंबर" pattern="[0-9]{10}" required></div>
                    <div class="form-group"><label>शिफ्ट चुनें</label>
                        <select name="shift" required>
                            <option value="">-- शिफ्ट चुनें --</option>
                            <option value="Morning (06-10 AM)">Morning (06-10 AM)</option>
                            <option value="Noon (10-02 PM)">Noon (10-02 PM)</option>
                            <option value="Evening (02-06 PM)">Evening (02-06 PM)</option>
                            <option value="Night (06-10 PM)">Night (06-10 PM)</option>
                            <option value="Full Day">Full Day Session</option>
                        </select>
                    </div>
                    <button type="submit" class="btn-submit"><i class="fas fa-paper-plane"></i> डिटेल्स भेजें</button>
                </form>
            </div>
        </div>
    </section>
    
    <section class="map-section reveal">
        <div class="map-container">
            <iframe id="googleMap" src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d58842.16!2d86.155!3d22.815!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39f5e31989f0e2b3%3A0x4560124953c80051!2sSakchi%2C%20Jamshedpur!5e0!3m2!1sen!2sin" allowfullscreen="" loading="lazy"></iframe>
        </div>
    </section>
    
    <footer>
        <div class="footer-content">
            <div class="footer-logo" id="footerLogo">DRISHTI DIGITAL <span>LIBRARY</span></div>
            <div class="footer-address" id="footerAddress">Sakchi Main Road, Jamshedpur, Jharkhand - 831001<br>Helpline: +91 98765 43210</div>
            <div class="social-links" id="socialLinks"></div>
            <div class="footer-links">
                <a href="/terms">Terms & Conditions</a>
                <a href="/privacy">Privacy Policy</a>
                <a href="/refund">Refund Policy</a>
                <a href="/contact">Contact Us</a>
                <a href="/about">About Us</a>
                <a href="/shipping">Shipping Policy</a>
            </div>
            <p class="copyright">© 2026 Drishti Digital Library. All Rights Reserved.</p>
        </div>
    </footer>
    
    <script>
        let siteSettings = {};
        let whatsappLink = 'https://wa.me/919876543210';
        let adminPanelUrl = '/admin';
        
        async function loadSettings() {
            try {
                const res = await fetch('/api/settings');
                siteSettings = await res.json();
                applySettings();
            } catch (e) { applyDefaultSettings(); }
        }
        
        function applySettings() {
            if (siteSettings.logo_url) document.getElementById('navLogo').src = siteSettings.logo_url;
            if (siteSettings.site_name) {
                document.getElementById('siteName').textContent = siteSettings.site_name;
                document.getElementById('footerLogo').innerHTML = siteSettings.site_name + ' <span>LIBRARY</span>';
            }
            if (siteSettings.phone) {
                document.getElementById('navPhone').href = 'tel:+91' + siteSettings.phone;
            }
            if (siteSettings.whatsapp) {
                whatsappLink = 'https://wa.me/91' + siteSettings.whatsapp;
                document.getElementById('whatsappFloat').href = whatsappLink;
            }
            if (siteSettings.address) {
                let addr = siteSettings.address;
                if (siteSettings.phone) addr += '<br>Helpline: +91 ' + siteSettings.phone;
                document.getElementById('footerAddress').innerHTML = addr;
            }
            if (siteSettings.map_embed) document.getElementById('googleMap').src = siteSettings.map_embed;
            if (siteSettings.admin_panel_url) adminPanelUrl = siteSettings.admin_panel_url;
        }
        
        function applyDefaultSettings() {
            document.getElementById('whatsappFloat').href = whatsappLink;
        }
        
        // Login button
        document.getElementById('loginBtn').addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = adminPanelUrl;
        });
        
        async function loadSlides() {
            try {
                const res = await fetch('/api/slides');
                const slides = await res.json();
                if (slides.length === 0) {
                    renderSlides([
                        { image_url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1350&q=80', title: 'शान्त वातावरण, बेहतर पढ़ाई', subtitle: 'Drishti Digital Library में आपका स्वागत है' },
                        { image_url: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1350&q=80', title: 'Focus on Your Success', subtitle: 'आधुनिक सुविधाओं के साथ अपनी मंज़िल को पाएं' }
                    ]);
                } else { renderSlides(slides); }
            } catch { renderSlides([
                { image_url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=1350&q=80', title: 'शान्त वातावरण, बेहतर पढ़ाई', subtitle: 'Drishti Digital Library में आपका स्वागत है' },
                { image_url: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1350&q=80', title: 'Focus on Your Success', subtitle: 'आधुनिक सुविधाओं के साथ अपनी मंज़िल को पाएं' }
            ]); }
        }
        
        function renderSlides(slides) {
            const container = document.getElementById('heroSlider');
            let html = slides.map((s, i) => '<div class="slide '+(i===0?'active':'')+'" style="background-image:url(\\''+s.image_url+'\\')"><div class="slide-overlay"></div><div class="slide-content"><h1>'+s.title+'</h1><p>'+s.subtitle+'</p><a href="#booking" class="hero-btn"><i class="fas fa-calendar-check"></i> अभी बुक करें</a></div></div>').join('');
            html += '<div class="slide-indicators">'+slides.map((_, i) => '<div class="indicator '+(i===0?'active':'')+'" data-index="'+i+'"></div>').join('')+'</div>';
            container.innerHTML = html;
            initSlider();
        }
        
        function initSlider() {
            const slides = document.querySelectorAll('.slide');
            const indicators = document.querySelectorAll('.indicator');
            let current = 0;
            function show(idx) {
                slides.forEach((s, i) => s.classList.toggle('active', i === idx));
                indicators.forEach((ind, i) => ind.classList.toggle('active', i === idx));
                current = idx;
            }
            setInterval(() => show((current + 1) % slides.length), 5000);
            indicators.forEach(ind => ind.addEventListener('click', () => show(parseInt(ind.dataset.index))));
        }
        
        async function loadPricing() {
            try {
                const res = await fetch('/api/pricing');
                const plans = await res.json();
                if (plans.length === 0) {
                    renderPricing([
                        { name: 'Single Shift', price: 500, duration: '/month', features: ['4 Hours Daily', 'AC Room', 'WiFi Access', 'Fixed Seat'], is_popular: false },
                        { name: 'Double Shift', price: 900, duration: '/month', features: ['8 Hours Daily', 'AC Room', 'WiFi Access', 'Fixed Seat', 'Locker Facility'], is_popular: true },
                        { name: 'Full Day', price: 1500, duration: '/month', features: ['16 Hours Daily', 'AC Room', 'WiFi Access', 'Fixed Seat', 'Locker Facility', 'Free Newspapers'], is_popular: false, is_full: true }
                    ]);
                } else { renderPricing(plans); }
            } catch { renderPricing([
                { name: 'Single Shift', price: 500, duration: '/month', features: ['4 Hours Daily', 'AC Room', 'WiFi Access', 'Fixed Seat'], is_popular: false },
                { name: 'Double Shift', price: 900, duration: '/month', features: ['8 Hours Daily', 'AC Room', 'WiFi Access', 'Fixed Seat', 'Locker Facility'], is_popular: true },
                { name: 'Full Day', price: 1500, duration: '/month', features: ['16 Hours Daily', 'AC Room', 'WiFi Access', 'Fixed Seat', 'Locker Facility', 'Free Newspapers'], is_popular: false, is_full: true }
            ]); }
        }
        
        function renderPricing(plans) {
            const grid = document.getElementById('pricingGrid');
            grid.innerHTML = plans.map(p => {
                const features = typeof p.features === 'string' ? JSON.parse(p.features) : p.features;
                return '<div class="pricing-card '+(p.is_popular?'popular':'')+(p.is_full?' pricing-full':'')+'">'
                    + (p.is_popular ? '<div class="pricing-badge">Most Popular</div>' : '')
                    + '<h3>'+p.name+'</h3>'
                    + '<div class="pricing-price">₹'+p.price+'<span>'+(p.duration||'/month')+'</span></div>'
                    + '<ul class="pricing-features">'+ features.map(f => '<li><i class="fas fa-check"></i> '+f+'</li>').join('') +'</ul>'
                    + '<a href="#booking" class="pricing-btn">Select Plan</a></div>';
            }).join('');
        }
        
        async function loadGallery() {
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
                } else { renderGallery(images); }
            } catch { renderGallery([
                { image_url: 'https://images.unsplash.com/photo-1491841573634-28140fc7ced7?auto=format&fit=crop&w=600&q=80' },
                { image_url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80' },
                { image_url: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=600&q=80' },
                { image_url: 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=600&q=80' }
            ]); }
        }
        
        function renderGallery(images) {
            document.getElementById('galleryGrid').innerHTML = images.map(img => '<div class="gallery-item"><img src="'+img.image_url+'" alt="Library" loading="lazy"></div>').join('');
        }
        
        async function loadSocialLinks() {
            try {
                const res = await fetch('/api/social-links');
                const links = await res.json();
                if (links.length === 0) {
                    renderSocialLinks([
                        { platform: 'whatsapp', url: whatsappLink },
                        { platform: 'instagram', url: '#' },
                        { platform: 'facebook', url: '#' },
                        { platform: 'youtube', url: '#' }
                    ]);
                } else { renderSocialLinks(links); }
            } catch { renderSocialLinks([
                { platform: 'whatsapp', url: whatsappLink },
                { platform: 'instagram', url: '#' },
                { platform: 'facebook', url: '#' },
                { platform: 'youtube', url: '#' }
            ]); }
        }
        
        function renderSocialLinks(links) {
            const icons = { whatsapp: 'fab fa-whatsapp', instagram: 'fab fa-instagram', facebook: 'fab fa-facebook-f', youtube: 'fab fa-youtube', twitter: 'fab fa-twitter', telegram: 'fab fa-telegram' };
            document.getElementById('socialLinks').innerHTML = links.map(l => '<a href="'+l.url+'" class="social-link '+l.platform+'" target="_blank"><i class="'+(icons[l.platform]||'fas fa-link')+'"></i></a>').join('');
            
            // Update WhatsApp float button with social link
            const waLink = links.find(l => l.platform === 'whatsapp');
            if (waLink && waLink.url) {
                document.getElementById('whatsappFloat').href = waLink.url;
            }
        }
        
        document.getElementById('contactForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const btn = form.querySelector('.btn-submit');
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> भेज रहे हैं...';
            btn.disabled = true;
            try {
                const res = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: form.name.value, phone: form.phone.value, shift: form.shift.value })
                });
                const result = await res.json();
                alert(result.message || 'धन्यवाद! हम आपसे जल्द संपर्क करेंगे।');
                form.reset();
            } catch { alert('कुछ गड़बड़ हुई। कृपया दोबारा प्रयास करें।'); }
            btn.innerHTML = orig;
            btn.disabled = false;
        });
        
        function reveal() {
            document.querySelectorAll('.reveal').forEach(el => {
                if (el.getBoundingClientRect().top < window.innerHeight - 100) el.classList.add('active');
            });
        }
        window.addEventListener('scroll', () => { reveal(); document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50); });
        document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', function(e) {
            e.preventDefault();
            const t = document.querySelector(this.getAttribute('href'));
            if (t) t.scrollIntoView({ behavior: 'smooth' });
        }));
        
        document.addEventListener('DOMContentLoaded', () => { loadSettings(); loadSlides(); loadPricing(); loadGallery(); loadSocialLinks(); reveal(); });
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
        :root { --primary: #0a1628; --primary-light: #1e3a5f; --accent: #f59e0b; --light: #f8fafc; --white: #fff; --gray: #94a3b8; --danger: #ef4444; --success: #22c55e; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Outfit', sans-serif; background: var(--light); min-height: 100vh; }
        .login-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--primary), var(--primary-light)); padding: 20px; }
        .login-box { background: var(--white); padding: 40px; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%; max-width: 400px; }
        .login-box h1 { text-align: center; color: var(--primary); margin-bottom: 10px; font-size: 1.8rem; }
        .login-box p { text-align: center; color: var(--gray); margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 500; color: var(--primary); }
        .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 12px 15px; border: 2px solid #e2e8f0; border-radius: 10px; font-size: 1rem; font-family: inherit; }
        .form-group input:focus, .form-group select:focus, .form-group textarea:focus { outline: none; border-color: var(--accent); }
        .form-group textarea { resize: vertical; min-height: 80px; }
        .btn { width: 100%; padding: 14px; background: linear-gradient(135deg, var(--accent), #d97706); color: white; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; font-family: inherit; }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(245,158,11,0.4); }
        .error-msg { color: var(--danger); text-align: center; margin-top: 15px; display: none; }
        .dashboard { display: none; }
        .sidebar { position: fixed; left: 0; top: 0; width: 250px; height: 100vh; background: var(--primary); padding: 20px; overflow-y: auto; }
        .sidebar-logo { color: white; font-size: 1.2rem; font-weight: 700; padding: 15px 0 25px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px; }
        .sidebar-logo span { color: var(--accent); }
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 15px; color: var(--gray); text-decoration: none; border-radius: 10px; margin-bottom: 5px; cursor: pointer; transition: all 0.3s; }
        .nav-item:hover, .nav-item.active { background: rgba(255,255,255,0.1); color: white; }
        .nav-item i { width: 20px; }
        .main-content { margin-left: 250px; padding: 25px; min-height: 100vh; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; }
        .header h2 { color: var(--primary); font-size: 1.4rem; }
        .logout-btn { background: var(--danger); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 500; }
        .back-btn { background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 500; margin-right: 10px; text-decoration: none; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .card { background: white; border-radius: 15px; padding: 25px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .card h3 { color: var(--primary); margin-bottom: 20px; font-size: 1.1rem; display: flex; align-items: center; gap: 10px; }
        .card h3 i { color: var(--accent); }
        .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px; }
        .btn-save { background: linear-gradient(135deg, var(--accent), #d97706); color: white; border: none; padding: 12px 25px; border-radius: 10px; cursor: pointer; font-weight: 600; font-family: inherit; margin-top: 15px; }
        .btn-save:hover { transform: translateY(-2px); }
        .list-item { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--light); border-radius: 10px; margin-bottom: 10px; flex-wrap: wrap; gap: 10px; }
        .list-item-info { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 200px; }
        .list-item img { width: 50px; height: 35px; object-fit: cover; border-radius: 6px; }
        .list-item-actions { display: flex; gap: 8px; }
        .btn-edit, .btn-delete { padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 0.8rem; }
        .btn-edit { background: var(--primary-light); color: white; }
        .btn-delete { background: var(--danger); color: white; }
        .btn-add { background: var(--success); color: white; border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 500; margin-bottom: 15px; }
        .contact-item { background: var(--light); padding: 12px; border-radius: 10px; margin-bottom: 10px; }
        .contact-item strong { color: var(--primary); }
        .contact-item p { color: var(--gray); font-size: 0.85rem; margin-top: 4px; }
        .toast { position: fixed; top: 20px; right: 20px; background: var(--success); color: white; padding: 15px 25px; border-radius: 10px; display: none; z-index: 9999; }
        .toast.error { background: var(--danger); }
        @media (max-width: 768px) {
            .sidebar { width: 100%; height: auto; position: relative; }
            .main-content { margin-left: 0; padding: 15px; }
            .form-row { grid-template-columns: 1fr; }
            .list-item { flex-direction: column; align-items: flex-start; }
        }
    </style>
</head>
<body>
    <div class="toast" id="toast"></div>
    
    <div class="login-container" id="loginPage">
        <div class="login-box">
            <h1><i class="fas fa-lock"></i> Admin Login</h1>
            <p>Drishti Digital Library Admin Panel</p>
            <form id="loginForm">
                <div class="form-group"><label>Username</label><input type="text" id="username" placeholder="Enter username" required></div>
                <div class="form-group"><label>Password</label><input type="password" id="password" placeholder="Enter password" required></div>
                <button type="submit" class="btn"><i class="fas fa-sign-in-alt"></i> Login</button>
                <p class="error-msg" id="loginError">Invalid username or password</p>
            </form>
        </div>
    </div>
    
    <div class="dashboard" id="dashboard">
        <div class="sidebar">
            <div class="sidebar-logo">DRISHTI <span>ADMIN</span></div>
            <a class="nav-item active" data-tab="general"><i class="fas fa-cog"></i> General Settings</a>
            <a class="nav-item" data-tab="slides"><i class="fas fa-images"></i> Hero Slides</a>
            <a class="nav-item" data-tab="pricing"><i class="fas fa-tags"></i> Pricing Plans</a>
            <a class="nav-item" data-tab="gallery"><i class="fas fa-photo-video"></i> Gallery</a>
            <a class="nav-item" data-tab="social"><i class="fas fa-share-alt"></i> Social Links</a>
            <a class="nav-item" data-tab="contacts"><i class="fas fa-envelope"></i> Contact Forms</a>
            <a class="nav-item" data-tab="password"><i class="fas fa-key"></i> Change Password</a>
        </div>
        
        <div class="main-content">
            <div class="header">
                <h2 id="pageTitle">General Settings</h2>
                <div>
                    <a href="/" class="back-btn"><i class="fas fa-home"></i> View Site</a>
                    <button class="logout-btn" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</button>
                </div>
            </div>
            
            <!-- General Settings -->
            <div class="tab-content active" id="tab-general">
                <div class="card">
                    <h3><i class="fas fa-store"></i> Website Information</h3>
                    <form id="settingsForm">
                        <div class="form-row">
                            <div class="form-group"><label>Site Name</label><input type="text" id="site_name" placeholder="Drishti Digital"></div>
                            <div class="form-group"><label>Logo URL</label><input type="url" id="logo_url" placeholder="https://example.com/logo.png"></div>
                        </div>
                        <div class="form-row">
                            <div class="form-group"><label>Phone Number</label><input type="tel" id="phone" placeholder="9876543210"></div>
                            <div class="form-group"><label>WhatsApp Number</label><input type="tel" id="whatsapp" placeholder="9876543210"></div>
                        </div>
                        <div class="form-group"><label>Address</label><textarea id="address" placeholder="Full address..."></textarea></div>
                        <div class="form-group"><label>Google Map Embed URL</label><input type="url" id="map_embed" placeholder="https://www.google.com/maps/embed?pb=..."></div>
                        <div class="form-group"><label>Admin Panel URL (for Login button)</label><input type="url" id="admin_panel_url" placeholder="/admin or https://yoursite.com/admin"></div>
                        <button type="submit" class="btn-save"><i class="fas fa-save"></i> Save Settings</button>
                    </form>
                </div>
            </div>
            
            <!-- Hero Slides -->
            <div class="tab-content" id="tab-slides">
                <button class="btn-add" onclick="showAddSlide()"><i class="fas fa-plus"></i> Add New Slide</button>
                <div class="card"><h3><i class="fas fa-images"></i> Manage Slides</h3><div id="slidesList"></div></div>
                <div class="card" id="slideForm" style="display:none;">
                    <h3><i class="fas fa-edit"></i> <span id="slideFormTitle">Add Slide</span></h3>
                    <input type="hidden" id="slideId">
                    <div class="form-group"><label>Image URL</label><input type="url" id="slideImage" placeholder="https://example.com/slide.jpg"></div>
                    <div class="form-group"><label>Title</label><input type="text" id="slideTitle" placeholder="Slide title..."></div>
                    <div class="form-group"><label>Subtitle</label><input type="text" id="slideSubtitle" placeholder="Slide subtitle..."></div>
                    <div class="form-group"><label>Order</label><input type="number" id="slideOrder" value="1" min="1"></div>
                    <button class="btn-save" onclick="saveSlide()"><i class="fas fa-save"></i> Save Slide</button>
                </div>
            </div>
            
            <!-- Pricing Plans -->
            <div class="tab-content" id="tab-pricing">
                <button class="btn-add" onclick="showAddPricing()"><i class="fas fa-plus"></i> Add New Plan</button>
                <div class="card"><h3><i class="fas fa-tags"></i> Pricing Plans</h3><div id="pricingList"></div></div>
                <div class="card" id="pricingForm" style="display:none;">
                    <h3><i class="fas fa-edit"></i> <span id="pricingFormTitle">Add Plan</span></h3>
                    <input type="hidden" id="pricingId">
                    <div class="form-row">
                        <div class="form-group"><label>Plan Name</label><input type="text" id="pricingName" placeholder="Single Shift"></div>
                        <div class="form-group"><label>Price (₹)</label><input type="number" id="pricingPrice" placeholder="500" min="0"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Duration</label><input type="text" id="pricingDuration" placeholder="/month" value="/month"></div>
                        <div class="form-group"><label>Order</label><input type="number" id="pricingOrder" value="1" min="1"></div>
                    </div>
                    <div class="form-group"><label>Features (one per line)</label><textarea id="pricingFeatures" placeholder="4 Hours Daily&#10;AC Room&#10;WiFi Access"></textarea></div>
                    <div class="form-row">
                        <div class="form-group"><label><input type="checkbox" id="pricingPopular"> Most Popular</label></div>
                        <div class="form-group"><label><input type="checkbox" id="pricingFull"> Full Width Card</label></div>
                    </div>
                    <button class="btn-save" onclick="savePricing()"><i class="fas fa-save"></i> Save Plan</button>
                </div>
            </div>
            
            <!-- Gallery -->
            <div class="tab-content" id="tab-gallery">
                <button class="btn-add" onclick="showAddGallery()"><i class="fas fa-plus"></i> Add Image</button>
                <div class="card"><h3><i class="fas fa-photo-video"></i> Gallery Images</h3><div id="galleryList"></div></div>
                <div class="card" id="galleryForm" style="display:none;">
                    <h3><i class="fas fa-edit"></i> <span id="galleryFormTitle">Add Image</span></h3>
                    <input type="hidden" id="galleryId">
                    <div class="form-group"><label>Image URL</label><input type="url" id="galleryImage" placeholder="https://example.com/image.jpg"></div>
                    <div class="form-group"><label>Caption (Optional)</label><input type="text" id="galleryCaption" placeholder="Image caption..."></div>
                    <div class="form-group"><label>Order</label><input type="number" id="galleryOrder" value="1" min="1"></div>
                    <button class="btn-save" onclick="saveGallery()"><i class="fas fa-save"></i> Save Image</button>
                </div>
            </div>
            
            <!-- Social Links -->
            <div class="tab-content" id="tab-social">
                <button class="btn-add" onclick="showAddSocial()"><i class="fas fa-plus"></i> Add Social Link</button>
                <div class="card"><h3><i class="fas fa-share-alt"></i> Social Media Links</h3><div id="socialList"></div></div>
                <div class="card" id="socialForm" style="display:none;">
                    <h3><i class="fas fa-edit"></i> <span id="socialFormTitle">Add Social Link</span></h3>
                    <input type="hidden" id="socialId">
                    <div class="form-group"><label>Platform</label>
                        <select id="socialPlatform">
                            <option value="whatsapp">WhatsApp</option>
                            <option value="instagram">Instagram</option>
                            <option value="facebook">Facebook</option>
                            <option value="youtube">YouTube</option>
                            <option value="twitter">Twitter</option>
                            <option value="telegram">Telegram</option>
                        </select>
                    </div>
                    <div class="form-group"><label>URL</label><input type="url" id="socialUrl" placeholder="https://wa.me/919876543210"></div>
                    <button class="btn-save" onclick="saveSocial()"><i class="fas fa-save"></i> Save Link</button>
                </div>
            </div>
            
            <!-- Contacts -->
            <div class="tab-content" id="tab-contacts">
                <div class="card"><h3><i class="fas fa-envelope"></i> Contact Form Submissions</h3><div id="contactsList"></div></div>
            </div>
            
            <!-- Change Password -->
            <div class="tab-content" id="tab-password">
                <div class="card">
                    <h3><i class="fas fa-key"></i> Change Password</h3>
                    <form id="passwordForm">
                        <div class="form-group"><label>Current Password</label><input type="password" id="currentPassword" required></div>
                        <div class="form-group"><label>New Password</label><input type="password" id="newPassword" required></div>
                        <div class="form-group"><label>Confirm New Password</label><input type="password" id="confirmPassword" required></div>
                        <button type="submit" class="btn-save"><i class="fas fa-save"></i> Update Password</button>
                    </form>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        let authToken = localStorage.getItem('adminToken');
        let currentUser = localStorage.getItem('adminUser');
        if (authToken) showDashboard();
        
        function showToast(msg, isError = false) {
            const toast = document.getElementById('toast');
            toast.textContent = msg;
            toast.className = 'toast' + (isError ? ' error' : '');
            toast.style.display = 'block';
            setTimeout(() => toast.style.display = 'none', 3000);
        }
        
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            try {
                const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
                const data = await res.json();
                if (data.success) {
                    authToken = data.token;
                    currentUser = username;
                    localStorage.setItem('adminToken', authToken);
                    localStorage.setItem('adminUser', username);
                    showDashboard();
                } else { document.getElementById('loginError').style.display = 'block'; }
            } catch { document.getElementById('loginError').style.display = 'block'; }
        });
        
        function showDashboard() {
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            loadSettings(); loadSlides(); loadPricing(); loadGallery(); loadSocialLinks(); loadContacts();
        }
        
        function logout() { localStorage.removeItem('adminToken'); localStorage.removeItem('adminUser'); location.reload(); }
        
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
        
        // Settings
        async function loadSettings() {
            try {
                const res = await fetch('/api/settings');
                const s = await res.json();
                document.getElementById('site_name').value = s.site_name || '';
                document.getElementById('logo_url').value = s.logo_url || '';
                document.getElementById('phone').value = s.phone || '';
                document.getElementById('whatsapp').value = s.whatsapp || '';
                document.getElementById('address').value = s.address || '';
                document.getElementById('map_embed').value = s.map_embed || '';
                document.getElementById('admin_panel_url').value = s.admin_panel_url || '';
            } catch {}
        }
        
        document.getElementById('settingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                    site_name: document.getElementById('site_name').value,
                    logo_url: document.getElementById('logo_url').value,
                    phone: document.getElementById('phone').value,
                    whatsapp: document.getElementById('whatsapp').value,
                    address: document.getElementById('address').value,
                    map_embed: document.getElementById('map_embed').value,
                    admin_panel_url: document.getElementById('admin_panel_url').value
                }) });
                showToast('Settings saved!');
            } catch { showToast('Failed to save', true); }
        });
        
        // Slides
        let slides = [];
        async function loadSlides() {
            try { slides = await (await fetch('/api/slides')).json(); renderSlides(); } catch { slides = []; renderSlides(); }
        }
        function renderSlides() {
            const list = document.getElementById('slidesList');
            if (!slides.length) { list.innerHTML = '<p style="color:#94a3b8;">No slides added yet.</p>'; return; }
            list.innerHTML = slides.map(s => '<div class="list-item"><div class="list-item-info"><img src="'+s.image_url+'"><div><strong>'+s.title+'</strong><p style="color:#94a3b8;font-size:0.8rem;">'+(s.subtitle||'')+'</p></div></div><div class="list-item-actions"><button class="btn-edit" onclick="editSlide('+s.id+')"><i class="fas fa-edit"></i></button><button class="btn-delete" onclick="deleteSlide('+s.id+')"><i class="fas fa-trash"></i></button></div></div>').join('');
        }
        function showAddSlide() { document.getElementById('slideForm').style.display = 'block'; document.getElementById('slideFormTitle').textContent = 'Add Slide'; document.getElementById('slideId').value = ''; document.getElementById('slideImage').value = ''; document.getElementById('slideTitle').value = ''; document.getElementById('slideSubtitle').value = ''; document.getElementById('slideOrder').value = slides.length + 1; }
        function editSlide(id) { const s = slides.find(x => x.id === id); if (!s) return; document.getElementById('slideForm').style.display = 'block'; document.getElementById('slideFormTitle').textContent = 'Edit Slide'; document.getElementById('slideId').value = id; document.getElementById('slideImage').value = s.image_url; document.getElementById('slideTitle').value = s.title; document.getElementById('slideSubtitle').value = s.subtitle || ''; document.getElementById('slideOrder').value = s.order_num || 1; }
        async function saveSlide() { const id = document.getElementById('slideId').value; const data = { image_url: document.getElementById('slideImage').value, title: document.getElementById('slideTitle').value, subtitle: document.getElementById('slideSubtitle').value, order_num: parseInt(document.getElementById('slideOrder').value) || 1 }; try { if (id) { await fetch('/api/slides/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } else { await fetch('/api/slides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } showToast('Slide saved!'); document.getElementById('slideForm').style.display = 'none'; loadSlides(); } catch { showToast('Failed', true); } }
        async function deleteSlide(id) { if (!confirm('Delete?')) return; try { await fetch('/api/slides/' + id, { method: 'DELETE' }); showToast('Deleted!'); loadSlides(); } catch { showToast('Failed', true); } }
        
        // Pricing
        let pricing = [];
        async function loadPricing() {
            try { pricing = await (await fetch('/api/pricing')).json(); renderPricing(); } catch { pricing = []; renderPricing(); }
        }
        function renderPricing() {
            const list = document.getElementById('pricingList');
            if (!pricing.length) { list.innerHTML = '<p style="color:#94a3b8;">No pricing plans added yet.</p>'; return; }
            list.innerHTML = pricing.map(p => '<div class="list-item"><div class="list-item-info"><div><strong>'+p.name+'</strong> - ₹'+p.price+(p.is_popular?' <span style="color:#22c55e;">(Popular)</span>':'')+'</div></div><div class="list-item-actions"><button class="btn-edit" onclick="editPricing('+p.id+')"><i class="fas fa-edit"></i></button><button class="btn-delete" onclick="deletePricing('+p.id+')"><i class="fas fa-trash"></i></button></div></div>').join('');
        }
        function showAddPricing() { document.getElementById('pricingForm').style.display = 'block'; document.getElementById('pricingFormTitle').textContent = 'Add Plan'; document.getElementById('pricingId').value = ''; document.getElementById('pricingName').value = ''; document.getElementById('pricingPrice').value = ''; document.getElementById('pricingDuration').value = '/month'; document.getElementById('pricingFeatures').value = ''; document.getElementById('pricingOrder').value = pricing.length + 1; document.getElementById('pricingPopular').checked = false; document.getElementById('pricingFull').checked = false; }
        function editPricing(id) { const p = pricing.find(x => x.id === id); if (!p) return; document.getElementById('pricingForm').style.display = 'block'; document.getElementById('pricingFormTitle').textContent = 'Edit Plan'; document.getElementById('pricingId').value = id; document.getElementById('pricingName').value = p.name; document.getElementById('pricingPrice').value = p.price; document.getElementById('pricingDuration').value = p.duration || '/month'; const features = typeof p.features === 'string' ? JSON.parse(p.features) : p.features; document.getElementById('pricingFeatures').value = features.join('\\n'); document.getElementById('pricingOrder').value = p.order_num || 1; document.getElementById('pricingPopular').checked = p.is_popular; document.getElementById('pricingFull').checked = p.is_full; }
        async function savePricing() { const id = document.getElementById('pricingId').value; const features = document.getElementById('pricingFeatures').value.split('\\n').filter(f => f.trim()); const data = { name: document.getElementById('pricingName').value, price: parseInt(document.getElementById('pricingPrice').value) || 0, duration: document.getElementById('pricingDuration').value, features: JSON.stringify(features), order_num: parseInt(document.getElementById('pricingOrder').value) || 1, is_popular: document.getElementById('pricingPopular').checked, is_full: document.getElementById('pricingFull').checked }; try { if (id) { await fetch('/api/pricing/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } else { await fetch('/api/pricing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } showToast('Plan saved!'); document.getElementById('pricingForm').style.display = 'none'; loadPricing(); } catch { showToast('Failed', true); } }
        async function deletePricing(id) { if (!confirm('Delete?')) return; try { await fetch('/api/pricing/' + id, { method: 'DELETE' }); showToast('Deleted!'); loadPricing(); } catch { showToast('Failed', true); } }
        
        // Gallery
        let gallery = [];
        async function loadGallery() { try { gallery = await (await fetch('/api/gallery')).json(); renderGallery(); } catch { gallery = []; renderGallery(); } }
        function renderGallery() { const list = document.getElementById('galleryList'); if (!gallery.length) { list.innerHTML = '<p style="color:#94a3b8;">No images added yet.</p>'; return; } list.innerHTML = gallery.map(g => '<div class="list-item"><div class="list-item-info"><img src="'+g.image_url+'"><div><strong>'+(g.caption||'No caption')+'</strong></div></div><div class="list-item-actions"><button class="btn-edit" onclick="editGallery('+g.id+')"><i class="fas fa-edit"></i></button><button class="btn-delete" onclick="deleteGallery('+g.id+')"><i class="fas fa-trash"></i></button></div></div>').join(''); }
        function showAddGallery() { document.getElementById('galleryForm').style.display = 'block'; document.getElementById('galleryFormTitle').textContent = 'Add Image'; document.getElementById('galleryId').value = ''; document.getElementById('galleryImage').value = ''; document.getElementById('galleryCaption').value = ''; document.getElementById('galleryOrder').value = gallery.length + 1; }
        function editGallery(id) { const g = gallery.find(x => x.id === id); if (!g) return; document.getElementById('galleryForm').style.display = 'block'; document.getElementById('galleryFormTitle').textContent = 'Edit Image'; document.getElementById('galleryId').value = id; document.getElementById('galleryImage').value = g.image_url; document.getElementById('galleryCaption').value = g.caption || ''; document.getElementById('galleryOrder').value = g.order_num || 1; }
        async function saveGallery() { const id = document.getElementById('galleryId').value; const data = { image_url: document.getElementById('galleryImage').value, caption: document.getElementById('galleryCaption').value, order_num: parseInt(document.getElementById('galleryOrder').value) || 1 }; try { if (id) { await fetch('/api/gallery/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } else { await fetch('/api/gallery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } showToast('Image saved!'); document.getElementById('galleryForm').style.display = 'none'; loadGallery(); } catch { showToast('Failed', true); } }
        async function deleteGallery(id) { if (!confirm('Delete?')) return; try { await fetch('/api/gallery/' + id, { method: 'DELETE' }); showToast('Deleted!'); loadGallery(); } catch { showToast('Failed', true); } }
        
        // Social Links
        let socials = [];
        async function loadSocialLinks() { try { socials = await (await fetch('/api/social-links')).json(); renderSocials(); } catch { socials = []; renderSocials(); } }
        function renderSocials() { const list = document.getElementById('socialList'); if (!socials.length) { list.innerHTML = '<p style="color:#94a3b8;">No social links added yet.</p>'; return; } const icons = { whatsapp: 'fab fa-whatsapp', instagram: 'fab fa-instagram', facebook: 'fab fa-facebook', youtube: 'fab fa-youtube', twitter: 'fab fa-twitter', telegram: 'fab fa-telegram' }; list.innerHTML = socials.map(s => '<div class="list-item"><div class="list-item-info"><i class="'+(icons[s.platform]||'fas fa-link')+'" style="font-size:1.3rem;color:var(--accent);"></i><div><strong>'+s.platform.charAt(0).toUpperCase()+s.platform.slice(1)+'</strong><p style="color:#94a3b8;font-size:0.75rem;">'+s.url+'</p></div></div><div class="list-item-actions"><button class="btn-edit" onclick="editSocial('+s.id+')"><i class="fas fa-edit"></i></button><button class="btn-delete" onclick="deleteSocial('+s.id+')"><i class="fas fa-trash"></i></button></div></div>').join(''); }
        function showAddSocial() { document.getElementById('socialForm').style.display = 'block'; document.getElementById('socialFormTitle').textContent = 'Add Social Link'; document.getElementById('socialId').value = ''; document.getElementById('socialPlatform').value = 'whatsapp'; document.getElementById('socialUrl').value = ''; }
        function editSocial(id) { const s = socials.find(x => x.id === id); if (!s) return; document.getElementById('socialForm').style.display = 'block'; document.getElementById('socialFormTitle').textContent = 'Edit Social Link'; document.getElementById('socialId').value = id; document.getElementById('socialPlatform').value = s.platform; document.getElementById('socialUrl').value = s.url; }
        async function saveSocial() { const id = document.getElementById('socialId').value; const data = { platform: document.getElementById('socialPlatform').value, url: document.getElementById('socialUrl').value }; try { if (id) { await fetch('/api/social-links/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } else { await fetch('/api/social-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } showToast('Link saved!'); document.getElementById('socialForm').style.display = 'none'; loadSocialLinks(); } catch { showToast('Failed', true); } }
        async function deleteSocial(id) { if (!confirm('Delete?')) return; try { await fetch('/api/social-links/' + id, { method: 'DELETE' }); showToast('Deleted!'); loadSocialLinks(); } catch { showToast('Failed', true); } }
        
        // Contacts
        async function loadContacts() { try { const contacts = await (await fetch('/api/contact')).json(); const list = document.getElementById('contactsList'); if (!contacts.length) { list.innerHTML = '<p style="color:#94a3b8;">No submissions yet.</p>'; return; } list.innerHTML = contacts.map(c => '<div class="contact-item"><strong>'+c.name+'</strong> - '+c.phone+'<p>Shift: '+c.shift+'</p><p style="font-size:0.75rem;color:#64748b;">'+new Date(c.created_at).toLocaleString()+'</p></div>').join(''); } catch { document.getElementById('contactsList').innerHTML = '<p style="color:#94a3b8;">Error loading contacts.</p>'; } }
        
        // Password
        document.getElementById('passwordForm').addEventListener('submit', async (e) => { e.preventDefault(); const curr = document.getElementById('currentPassword').value; const newP = document.getElementById('newPassword').value; const conf = document.getElementById('confirmPassword').value; if (newP !== conf) { showToast('Passwords do not match!', true); return; } try { const res = await fetch('/api/admin/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser, currentPassword: curr, newPassword: newP }) }); const data = await res.json(); if (data.success) { showToast('Password updated!'); document.getElementById('passwordForm').reset(); } else { showToast(data.message || 'Failed', true); } } catch { showToast('Error', true); } });
    </script>
</body>
</html>`)
})

// Legal Pages
app.get('/terms', (c) => c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Terms & Conditions - Drishti Digital Library</title><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Outfit',sans-serif;background:#f8fafc;color:#1e293b;line-height:1.8}.container{max-width:900px;margin:0 auto;padding:40px 20px}h1{color:#0a1628;margin-bottom:30px;font-size:2rem;border-bottom:3px solid #f59e0b;padding-bottom:15px}h2{color:#1e3a5f;margin:30px 0 15px;font-size:1.3rem}p{margin-bottom:15px;color:#475569}ul{margin:15px 0 15px 25px}li{margin-bottom:10px;color:#475569}.back-link{display:inline-block;margin-bottom:30px;color:#f59e0b;text-decoration:none;font-weight:500}.last-updated{color:#94a3b8;font-size:0.9rem;margin-top:40px}</style></head><body><div class="container"><a href="/" class="back-link">← Back to Home</a><h1>Terms & Conditions</h1><p>Welcome to Drishti Digital Library. By accessing and using our services, you agree to be bound by these Terms and Conditions.</p><h2>1. Services</h2><p>Drishti Digital Library provides self-study center facilities including:</p><ul><li>Air-conditioned study space</li><li>High-speed WiFi connectivity</li><li>Reading materials and newspapers</li><li>CCTV monitored secure environment</li><li>RO purified drinking water</li></ul><h2>2. Membership & Booking</h2><ul><li>Memberships are available on monthly, quarterly, and yearly basis</li><li>Seat booking is subject to availability</li><li>Members must carry valid ID proof at all times</li><li>Membership is non-transferable</li></ul><h2>3. Payment Terms</h2><ul><li>All fees must be paid in advance</li><li>We accept online payments via UPI, Cards, and Net Banking through Cashfree Payment Gateway</li><li>Prices are subject to change with prior notice</li><li>GST and applicable taxes are included in the displayed prices</li></ul><h2>4. Rules & Conduct</h2><ul><li>Maintain silence and discipline in the study area</li><li>Mobile phones must be kept on silent mode</li><li>No food or beverages inside the study hall (except water)</li><li>Personal belongings are the responsibility of the member</li><li>Any damage to property will be charged to the member</li></ul><h2>5. Cancellation & Refunds</h2><p>Please refer to our <a href="/refund" style="color:#f59e0b;">Refund Policy</a> for detailed information.</p><h2>6. Privacy</h2><p>Your privacy is important to us. Please review our <a href="/privacy" style="color:#f59e0b;">Privacy Policy</a>.</p><h2>7. Liability</h2><ul><li>Drishti Digital Library is not liable for any loss or theft of personal belongings</li><li>We reserve the right to modify operating hours during festivals and emergencies</li><li>Members violating rules may have their membership terminated without refund</li></ul><h2>8. Contact Information</h2><p>For any queries, please contact us:</p><ul><li>Phone: +91 98765 43210</li><li>WhatsApp: +91 98765 43210</li><li>Address: Sakchi Main Road, Jamshedpur, Jharkhand - 831001</li></ul><p class="last-updated">Last Updated: January 2026</p></div></body></html>`))

app.get('/privacy', (c) => c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Privacy Policy - Drishti Digital Library</title><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Outfit',sans-serif;background:#f8fafc;color:#1e293b;line-height:1.8}.container{max-width:900px;margin:0 auto;padding:40px 20px}h1{color:#0a1628;margin-bottom:30px;font-size:2rem;border-bottom:3px solid #f59e0b;padding-bottom:15px}h2{color:#1e3a5f;margin:30px 0 15px;font-size:1.3rem}p{margin-bottom:15px;color:#475569}ul{margin:15px 0 15px 25px}li{margin-bottom:10px;color:#475569}.back-link{display:inline-block;margin-bottom:30px;color:#f59e0b;text-decoration:none;font-weight:500}.last-updated{color:#94a3b8;font-size:0.9rem;margin-top:40px}</style></head><body><div class="container"><a href="/" class="back-link">← Back to Home</a><h1>Privacy Policy</h1><p>At Drishti Digital Library, we are committed to protecting your privacy.</p><h2>1. Information We Collect</h2><ul><li><strong>Personal Information:</strong> Name, phone number, email address when you register</li><li><strong>Identity Information:</strong> ID proof details for membership verification</li><li><strong>Payment Information:</strong> Transaction details processed through secure payment gateways</li><li><strong>CCTV Footage:</strong> For security purposes within our premises</li></ul><h2>2. How We Use Your Information</h2><ul><li>To process your membership and seat bookings</li><li>To communicate important updates and offers</li><li>To process payments securely</li><li>To improve our services and facilities</li><li>To ensure security of our premises</li></ul><h2>3. Data Security</h2><ul><li>All payment transactions are processed through Cashfree Payment Gateway with encryption</li><li>We do not store credit card/debit card details on our servers</li><li>Access to personal data is restricted to authorized personnel only</li><li>CCTV footage is stored securely and accessed only for security purposes</li></ul><h2>4. Third-Party Services</h2><ul><li><strong>Cashfree Payments:</strong> For processing online payments</li><li><strong>Supabase:</strong> For secure data storage with industry-standard encryption</li></ul><h2>5. Data Retention</h2><ul><li>Member information is retained for the duration of membership plus 1 year</li><li>Payment records are kept as per legal requirements (typically 7 years)</li><li>CCTV footage is retained for 30 days unless required for investigation</li></ul><h2>6. Your Rights</h2><ul><li>Access your personal information we hold</li><li>Request correction of inaccurate data</li><li>Request deletion of your data (subject to legal requirements)</li><li>Opt-out of marketing communications</li></ul><h2>7. Contact Us</h2><p>For privacy-related queries:</p><ul><li>Phone: +91 98765 43210</li><li>WhatsApp: +91 98765 43210</li><li>Address: Sakchi Main Road, Jamshedpur, Jharkhand - 831001</li></ul><p class="last-updated">Last Updated: January 2026</p></div></body></html>`))

app.get('/refund', (c) => c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Refund Policy - Drishti Digital Library</title><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Outfit',sans-serif;background:#f8fafc;color:#1e293b;line-height:1.8}.container{max-width:900px;margin:0 auto;padding:40px 20px}h1{color:#0a1628;margin-bottom:30px;font-size:2rem;border-bottom:3px solid #f59e0b;padding-bottom:15px}h2{color:#1e3a5f;margin:30px 0 15px;font-size:1.3rem}p{margin-bottom:15px;color:#475569}ul{margin:15px 0 15px 25px}li{margin-bottom:10px;color:#475569}.back-link{display:inline-block;margin-bottom:30px;color:#f59e0b;text-decoration:none;font-weight:500}.last-updated{color:#94a3b8;font-size:0.9rem;margin-top:40px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #e2e8f0;padding:12px;text-align:left}th{background:#0a1628;color:white}tr:nth-child(even){background:#f1f5f9}.highlight{background:#fef3c7;padding:20px;border-radius:10px;margin:20px 0;border-left:4px solid #f59e0b}</style></head><body><div class="container"><a href="/" class="back-link">← Back to Home</a><h1>Refund & Cancellation Policy</h1><p>This policy outlines the terms under which refunds and cancellations are processed at Drishti Digital Library.</p><h2>1. Membership Cancellation</h2><table><tr><th>Cancellation Time</th><th>Refund Amount</th></tr><tr><td>Within 24 hours of purchase</td><td>Full refund (100%)</td></tr><tr><td>Within 3 days of purchase</td><td>90% refund</td></tr><tr><td>Within 7 days of purchase</td><td>75% refund</td></tr><tr><td>After 7 days</td><td>No refund</td></tr></table><div class="highlight"><strong>Note:</strong> Refunds are calculated based on unused days of membership. Any promotional discounts availed will be adjusted in the refund amount.</div><h2>2. How to Request a Refund</h2><ul><li>Contact us via phone or WhatsApp at +91 98765 43210</li><li>Provide your membership ID and reason for cancellation</li><li>Submit a written request (can be via WhatsApp)</li><li>Our team will verify and process within 3-5 business days</li></ul><h2>3. Refund Processing Time</h2><ul><li>Once approved, refunds will be processed within 5-7 business days</li><li>Refunds will be credited to the original payment method</li><li>For UPI/Net Banking: 2-3 business days</li><li>For Credit/Debit Cards: 5-7 business days</li></ul><h2>4. Non-Refundable Situations</h2><ul><li>Membership terminated due to violation of rules</li><li>No-show without prior intimation</li><li>After using more than 50% of the membership period</li><li>Special promotional or discounted memberships (unless specified)</li></ul><h2>5. Shift Changes</h2><ul><li>Shift changes are allowed once per month at no additional cost</li><li>Subject to availability in the requested shift</li><li>Must be requested at least 24 hours in advance</li></ul><h2>6. Payment Gateway</h2><p>All online payments are processed securely through <strong>Cashfree Payments</strong>. In case of any payment failure or double deduction:</p><ul><li>Contact our support immediately with transaction details</li><li>Provide bank statement if requested</li><li>Refund for failed transactions is processed within 24-48 hours</li></ul><h2>7. Contact for Refunds</h2><ul><li><strong>Phone:</strong> +91 98765 43210</li><li><strong>WhatsApp:</strong> +91 98765 43210</li><li><strong>Timing:</strong> 9:00 AM - 8:00 PM (Mon-Sat)</li><li><strong>Address:</strong> Sakchi Main Road, Jamshedpur, Jharkhand - 831001</li></ul><p class="last-updated">Last Updated: January 2026</p></div></body></html>`))

app.get('/contact', (c) => c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Contact Us - Drishti Digital Library</title><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Outfit',sans-serif;background:#f8fafc;color:#1e293b;line-height:1.8}.container{max-width:900px;margin:0 auto;padding:40px 20px}h1{color:#0a1628;margin-bottom:30px;font-size:2rem;border-bottom:3px solid #f59e0b;padding-bottom:15px}.back-link{display:inline-block;margin-bottom:30px;color:#f59e0b;text-decoration:none;font-weight:500}.contact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:40px}.contact-card{background:white;padding:25px;border-radius:15px;text-align:center;box-shadow:0 4px 15px rgba(0,0,0,0.05)}.contact-card i{font-size:2rem;color:#f59e0b;margin-bottom:15px}.contact-card h3{color:#0a1628;margin-bottom:10px}.contact-card p{color:#475569}.contact-card a{color:#1e3a5f;text-decoration:none;font-weight:500}.map-container{border-radius:15px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.1)}.map-container iframe{width:100%;height:350px;border:none}</style></head><body><div class="container"><a href="/" class="back-link">← Back to Home</a><h1>Contact Us</h1><div class="contact-grid"><div class="contact-card"><i class="fas fa-phone"></i><h3>Phone</h3><p><a href="tel:+919876543210">+91 98765 43210</a></p></div><div class="contact-card"><i class="fab fa-whatsapp"></i><h3>WhatsApp</h3><p><a href="https://wa.me/919876543210" target="_blank">+91 98765 43210</a></p></div><div class="contact-card"><i class="fas fa-clock"></i><h3>Hours</h3><p>6:00 AM - 10:00 PM<br>All Days Open</p></div><div class="contact-card"><i class="fas fa-map-marker-alt"></i><h3>Address</h3><p>Sakchi Main Road,<br>Jamshedpur, Jharkhand - 831001</p></div></div><h2 style="color:#0a1628;margin-bottom:20px;">Find Us on Map</h2><div class="map-container"><iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d58842.16!2d86.155!3d22.815!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39f5e31989f0e2b3%3A0x4560124953c80051!2sSakchi%2C%20Jamshedpur!5e0!3m2!1sen!2sin" allowfullscreen="" loading="lazy"></iframe></div></div></body></html>`))

app.get('/about', (c) => c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>About Us - Drishti Digital Library</title><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Outfit',sans-serif;background:#f8fafc;color:#1e293b;line-height:1.8}.container{max-width:900px;margin:0 auto;padding:40px 20px}h1{color:#0a1628;margin-bottom:30px;font-size:2rem;border-bottom:3px solid #f59e0b;padding-bottom:15px}h2{color:#1e3a5f;margin:30px 0 15px;font-size:1.3rem}p{margin-bottom:15px;color:#475569}ul{margin:15px 0 15px 25px}li{margin-bottom:10px;color:#475569}.back-link{display:inline-block;margin-bottom:30px;color:#f59e0b;text-decoration:none;font-weight:500}</style></head><body><div class="container"><a href="/" class="back-link">← Back to Home</a><h1>About Us</h1><p>Welcome to <strong>Drishti Digital Library</strong> - Your Premium Self-Study Center in Jamshedpur, Jharkhand.</p><h2>Our Mission</h2><p>To provide a peaceful, comfortable, and well-equipped study environment for students preparing for competitive exams, board exams, and professional courses.</p><h2>What We Offer</h2><ul><li>Fully Air-Conditioned Study Hall</li><li>High-Speed WiFi Connectivity</li><li>24x7 CCTV Surveillance for Security</li><li>Power Backup for Uninterrupted Study</li><li>RO Purified Drinking Water</li><li>Daily Newspapers and Magazines</li><li>Comfortable Seating Arrangements</li><li>Individual Study Desks</li><li>Locker Facility for Belongings</li></ul><h2>Why Choose Us?</h2><ul><li><strong>Peaceful Environment:</strong> Strictly maintained silence for focused studying</li><li><strong>Affordable Pricing:</strong> Multiple plans to suit every budget</li><li><strong>Flexible Timings:</strong> Choose from 4 different shift options</li><li><strong>Prime Location:</strong> Conveniently located at Sakchi Main Road</li><li><strong>Professional Management:</strong> Dedicated staff for assistance</li></ul><h2>Our Vision</h2><p>To become the most trusted and preferred self-study center in Jharkhand, helping thousands of students achieve their academic and career goals.</p><h2>Contact Us</h2><p>Ready to start your success journey? Contact us today!</p><ul><li><strong>Phone:</strong> +91 98765 43210</li><li><strong>WhatsApp:</strong> +91 98765 43210</li><li><strong>Address:</strong> Sakchi Main Road, Jamshedpur, Jharkhand - 831001</li></ul></div></body></html>`))

app.get('/shipping', (c) => c.html(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Shipping Policy - Drishti Digital Library</title><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Outfit',sans-serif;background:#f8fafc;color:#1e293b;line-height:1.8}.container{max-width:900px;margin:0 auto;padding:40px 20px}h1{color:#0a1628;margin-bottom:30px;font-size:2rem;border-bottom:3px solid #f59e0b;padding-bottom:15px}h2{color:#1e3a5f;margin:30px 0 15px;font-size:1.3rem}p{margin-bottom:15px;color:#475569}ul{margin:15px 0 15px 25px}li{margin-bottom:10px;color:#475569}.back-link{display:inline-block;margin-bottom:30px;color:#f59e0b;text-decoration:none;font-weight:500}.last-updated{color:#94a3b8;font-size:0.9rem;margin-top:40px}</style></head><body><div class="container"><a href="/" class="back-link">← Back to Home</a><h1>Shipping & Delivery Policy</h1><h2>1. Nature of Services</h2><p>Drishti Digital Library is a <strong>physical self-study center</strong> located in Jamshedpur, Jharkhand. We provide on-premises study facilities and do not sell or ship any physical products.</p><h2>2. Service Delivery</h2><ul><li><strong>Membership Activation:</strong> Immediately upon successful payment</li><li><strong>Seat Allocation:</strong> Within 24 hours of membership confirmation</li><li><strong>Membership Card:</strong> Issued on first visit to the center</li></ul><h2>3. Digital Confirmations</h2><p>Upon successful payment, you will receive:</p><ul><li>Payment confirmation via SMS/Email</li><li>Membership details via WhatsApp</li><li>Welcome message with center rules</li></ul><h2>4. No Physical Shipping</h2><p>As we are a service-based business providing study space, there is no physical shipping or delivery involved. All services are consumed at our premises.</p><h2>5. Contact Us</h2><p>For any queries regarding service delivery:</p><ul><li><strong>Phone:</strong> +91 98765 43210</li><li><strong>WhatsApp:</strong> +91 98765 43210</li><li><strong>Address:</strong> Sakchi Main Road, Jamshedpur, Jharkhand - 831001</li></ul><p class="last-updated">Last Updated: January 2026</p></div></body></html>`))

export default app
