const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const crypto = require('node:crypto');

const DB_PATH = path.join(__dirname, 'salon.db');
const db = new DatabaseSync(DB_PATH);

// Helper for hashing password
function hashPassword(password, salt) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(testHash, 'hex'));
}

// Generate unique Booking ID: e.g. LUMI-20261102-8F42
function generateBookingId(dateStr) {
  const cleanDate = (dateStr || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `LUMI-${cleanDate}-${randomPart}`;
}

// Initialize tables and seed Indian Salon data
function initDatabase() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      duration INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id TEXT UNIQUE NOT NULL,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      service_id INTEGER NOT NULL,
      service_name TEXT NOT NULL,
      service_price REAL NOT NULL,
      stylist TEXT DEFAULT 'Any Available Stylist',
      booking_date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed',
      cancel_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (service_id) REFERENCES services(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS blocked_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time_slot TEXT,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shop_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      subject TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'unread',
      created_at TEXT NOT NULL
    );
  `);

  // Seed default Indian shop settings
  const insertSetting = db.prepare('INSERT OR REPLACE INTO shop_settings (key, value) VALUES (?, ?)');

  const indianSettings = {
    salon_name: 'LUMIÈRE Luxury Unisex Salon & Spa',
    tagline: 'Artistry, Ayurvedic Wellness & Contemporary Elegance',
    phone: '+91 98765 43210',
    email: 'concierge@lumieresalon.in',
    address: 'Plot No. 42, 100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038',
    max_slot_capacity: '3',
    hours_mon_fri: '09:00 AM - 08:30 PM',
    hours_sat: '09:00 AM - 08:00 PM',
    hours_sun: '10:00 AM - 07:00 PM',
    about_story: 'Founded in Bengaluru, LUMIÈRE brings together international haircare expertise with time-honored Indian botanical beauty rituals. We believe that self-care is a celebration of individuality. From restorative L’Oréal hair spas and O3+ brightening facials to signature bridal couture, our master artisans craft transformative experiences tailored to Indian hair and skin textures.',
    facilities: 'Private VIP Styling Suites, L’Oréal & O3+ Certified Formulations, Organic Ayurvedic Kesh Bar, Complimentary Filter Coffee & Masala Chai, Express Champi Stations, Free Valet Parking, Hospital-grade UV Sterilization',
    holidays: 'Diwali, Pongal / Makar Sankranti, Independence Day (Aug 15), Republic Day (Jan 26)'
  };

  for (const [key, value] of Object.entries(indianSettings)) {
    insertSetting.run(key, value);
  }

  // Seed Admin user
  const getUser = db.prepare('SELECT id FROM users WHERE email = ?');
  let admin = getUser.get('admin@luxesalon.com');
  if (!admin) {
    const { hash, salt } = hashPassword('admin123');
    const insertUser = db.prepare(`
      INSERT INTO users (name, email, phone, password_hash, password_salt, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertUser.run(
      'Salon Master Admin',
      'admin@luxesalon.com',
      '+91 98765 43210',
      hash,
      salt,
      'admin',
      new Date().toISOString()
    );
  }

  // Seed Indian Customer user (Priya Sharma)
  let customer = getUser.get('priya.sharma@example.com');
  let customerId = null;
  if (!customer) {
    const { hash, salt } = hashPassword('password123');
    const insertUser = db.prepare(`
      INSERT INTO users (name, email, phone, password_hash, password_salt, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const res = insertUser.run(
      'Priya Sharma',
      'priya.sharma@example.com',
      '+91 98450 12345',
      hash,
      salt,
      'customer',
      new Date().toISOString()
    );
    customerId = Number(res.lastInsertRowid);
  } else {
    customerId = customer.id;
  }

  // Re-seed Popular Indian Salon Services
  // Clean bookings first due to foreign key constraints, then services
  db.exec('DELETE FROM bookings; DELETE FROM services;');

  const insertService = db.prepare(`
    INSERT INTO services (name, category, description, price, duration, image_url, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const popularIndianServices = [
    {
      name: 'Men’s Classic Haircut, Beard Trim & Hot Towel',
      category: 'Grooming',
      description: 'Personalized consultation, precision scissor & clipper cut, beard sculpting, refreshing eucalyptus hot towel wrap, and cooling aftershave balm.',
      price: 350,
      duration: 35,
      image_url: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Women’s Advanced Layer Cut & Blowdry Style',
      category: 'Hair Styling & Cut',
      description: 'Customized face-framing layer or feather cut with clarifying shampoo, deep moisture conditioning rinse, and high-volume bouncy blowdry.',
      price: 650,
      duration: 45,
      image_url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'L’Oréal Professionnel Deep Nourishing Hair Spa',
      category: 'Hair Treatment',
      description: 'Deep scalp detoxification, hair bath, intensive water-lily nutrient creambath massage, hot ozone steam, and ultra-hydrating serum application.',
      price: 999,
      duration: 60,
      image_url: 'https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'O3+ Bridal Radiance Glow & De-Tan Facial',
      category: 'Skincare & Facial',
      description: 'Award-winning O3+ formulation targeting tanning and pigmentation: lactic peel, micro-circulation massage, whitening mask, and cellular serum.',
      price: 1499,
      duration: 60,
      image_url: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Keratin Protein Hair Smoothening Treatment',
      category: 'Hair Treatment',
      description: 'Formaldehyde-free Brazilian keratin infusion that eliminates unmanageable frizz, reduces blowdry time by 70%, and leaves silk-straight shine for 4-6 months.',
      price: 3499,
      duration: 150,
      image_url: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Global Hair Color & Ammonia-Free Root Touch-Up',
      category: 'Hair Coloring',
      description: '100% grey coverage with INOA ammonia-free oil delivery system color, enriched with argan gloss treatment for long-lasting vibrant shine.',
      price: 1850,
      duration: 90,
      image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Traditional Ayurvedic Kesh Champi Head Massage',
      category: 'Spa & Massage',
      description: 'Authentic warm Bhringraj & Brahmi herbal oil therapy targeting pressure points on scalp, neck, and shoulders to release stress and promote hair growth.',
      price: 499,
      duration: 30,
      image_url: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Lotus Botanical De-Tan Bleach & Face Pack',
      category: 'Skincare & Facial',
      description: 'Instant tan removal formula with herbal extracts, fruit enzymes, and soothing aloe vera to lighten sun tan and even out skin tone.',
      price: 550,
      duration: 35,
      image_url: 'https://images.unsplash.com/photo-1512290900672-1f4f6e6f66c0?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Rose Water & Honey Pedicure + Manicure Duo',
      category: 'Nails & Pedicure',
      description: 'Rose petal herbal foot soak, dead skin scrubbing, cuticle cleaning, hydrating honey butter massage, and salon nail buffing with polish.',
      price: 799,
      duration: 60,
      image_url: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Full Arms & Legs Rica Waxing + Eyebrow Threading',
      category: 'Waxing & Threading',
      description: 'Colophony-free Italian Rica wax suitable for sensitive Indian skin, removing fine hair without redness, completed with precision eyebrow & upper lip threading.',
      price: 899,
      duration: 45,
      image_url: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Aroma Stress-Relief Full Body Swedish Massage',
      category: 'Spa & Massage',
      description: 'Full-body relaxation utilizing warm essential oils (lavender and lemongrass), stimulating blood circulation and melting muscle fatigue.',
      price: 1899,
      duration: 60,
      image_url: 'https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&w=800&q=80'
    },
    {
      name: 'Royal Bridal Makeover & Saree Draping Package',
      category: 'Bridal & Glamour',
      description: 'HD waterproof airbrush makeup, intricate traditional or contemporary bridal hair updo, lash extensions, jewelry setting, and professional saree/lehenga draping.',
      price: 7500,
      duration: 180,
      image_url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80'
    }
  ];

  const now = new Date().toISOString();
  for (const s of popularIndianServices) {
    insertService.run(s.name, s.category, s.description, s.price, s.duration, s.image_url, 1, now);
  }

  // Update existing bookings or insert sample Indian bookings
  db.exec('DELETE FROM bookings');
  const servicesList = db.prepare('SELECT * FROM services').all();

  const insertBooking = db.prepare(`
    INSERT INTO bookings (
      booking_id, user_id, customer_name, customer_email, customer_phone,
      service_id, service_name, service_price, stylist,
      booking_date, time_slot, notes, status, cancel_reason,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const today = new Date().toISOString().slice(0, 10);
  const tomorrowDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const yesterdayDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const sampleIndianBookings = [
    {
      booking_id: `LUMI-${today.replace(/-/g, '')}-IN01`,
      user_id: customerId,
      customer_name: 'Priya Sharma',
      customer_email: 'priya.sharma@example.com',
      customer_phone: '+91 98450 12345',
      service: servicesList[1], // Layer cut
      stylist: 'Kavita Nair (Creative Director & Hair Artist)',
      date: today,
      slot: '11:00 AM',
      notes: 'Please recommend a serum for humid weather frizz.',
      status: 'confirmed',
      cancel_reason: null
    },
    {
      booking_id: `LUMI-${today.replace(/-/g, '')}-IN02`,
      user_id: null,
      customer_name: 'Rahul Verma',
      customer_email: 'rahul.v@example.com',
      customer_phone: '+91 98201 54321',
      service: servicesList[0], // Men's haircut & beard
      stylist: 'Arjun Kapoor (Executive Barber & Stylist)',
      date: today,
      slot: '02:00 PM',
      notes: 'Need beard sharp fade for a wedding function.',
      status: 'confirmed',
      cancel_reason: null
    },
    {
      booking_id: `LUMI-${tomorrowDate.replace(/-/g, '')}-IN03`,
      user_id: customerId,
      customer_name: 'Priya Sharma',
      customer_email: 'priya.sharma@example.com',
      customer_phone: '+91 98450 12345',
      service: servicesList[3], // O3+ Facial
      stylist: 'Meera Sen (Lead Skin & Bridal Esthetician)',
      date: tomorrowDate,
      slot: '10:00 AM',
      notes: 'Has sensitive skin on forehead.',
      status: 'confirmed',
      cancel_reason: null
    },
    {
      booking_id: `LUMI-${yesterdayDate.replace(/-/g, '')}-IN04`,
      user_id: null,
      customer_name: 'Ananya Iyer',
      customer_email: 'ananya.iyer@example.com',
      customer_phone: '+91 97412 88990',
      service: servicesList[2], // Hair spa
      stylist: 'Kavita Nair (Creative Director & Hair Artist)',
      date: yesterdayDate,
      slot: '01:00 PM',
      notes: 'Loved the cooling steam massage!',
      status: 'completed',
      cancel_reason: null
    },
    {
      booking_id: `LUMI-${yesterdayDate.replace(/-/g, '')}-IN05`,
      user_id: null,
      customer_name: 'Vikram Malhotra',
      customer_email: 'vikram.m@example.com',
      customer_phone: '+91 99800 11223',
      service: servicesList[6], // Ayurvedic Champi
      stylist: 'Rajesh Kumar (Master Texture & Wellness Specialist)',
      date: yesterdayDate,
      slot: '03:00 PM',
      notes: 'Office meeting ran late.',
      status: 'cancelled',
      cancel_reason: 'Sudden office client escalation'
    }
  ];

  for (const b of sampleIndianBookings) {
    insertBooking.run(
      b.booking_id,
      b.user_id,
      b.customer_name,
      b.customer_email,
      b.customer_phone,
      b.service.id,
      b.service.name,
      b.service.price,
      b.stylist,
      b.date,
      b.slot,
      b.notes,
      b.status,
      b.cancel_reason,
      now,
      now
    );
  }
}

// Initialize on require
initDatabase();

module.exports = {
  db,
  hashPassword,
  verifyPassword,
  generateBookingId
};
