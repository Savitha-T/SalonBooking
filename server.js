const express = require('express');
const path = require('node:path');
const { db, hashPassword, verifyPassword, generateBookingId } = require('./db.js');
const { signToken, authMiddleware, requireAuth, requireAdmin } = require('./auth.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Standard salon time slots
const STANDARD_TIME_SLOTS = [
  '09:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '01:00 PM',
  '02:00 PM',
  '03:00 PM',
  '04:00 PM',
  '05:00 PM',
  '06:00 PM',
  '07:00 PM'
];

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Helper to get shop settings
function getShopSettings() {
  const rows = db.prepare('SELECT key, value FROM shop_settings').all();
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// Helper to get max slot capacity
function getMaxSlotCapacity() {
  const row = db.prepare("SELECT value FROM shop_settings WHERE key = 'max_slot_capacity'").get();
  return row ? parseInt(row.value, 10) || 3 : 3;
}

// -------------------------------------------------------------
// PUBLIC / CLIENT API ROUTES
// -------------------------------------------------------------

// Get shop settings / info
app.get('/api/shop-info', (req, res) => {
  try {
    const settings = getShopSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get active services
app.get('/api/services', (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM services WHERE is_active = 1';
    let params = [];
    if (category && category !== 'All') {
      query += ' AND category = ?';
      params.push(category);
    }
    query += ' ORDER BY id ASC';
    const services = db.prepare(query).all(...params);
    res.json({ success: true, services });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single service by id
app.get('/api/services/:id', (req, res) => {
  try {
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }
    res.json({ success: true, service });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Customer registration
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const { hash, salt } = hashPassword(password);
    const insert = db.prepare(`
      INSERT INTO users (name, email, phone, password_hash, password_salt, role, created_at)
      VALUES (?, ?, ?, ?, ?, 'customer', ?)
    `);
    const result = insert.run(name.trim(), cleanEmail, phone.trim(), hash, salt, new Date().toISOString());

    const user = {
      id: Number(result.lastInsertRowid),
      name: name.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      role: 'customer'
    };

    const token = signToken(user);

    // Set cookie
    res.cookie('lumiere_token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 3600 * 1000,
      sameSite: 'lax'
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to LUMIÈRE.',
      user,
      token
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Login (Customer or Admin)
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
    if (!userRow) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isValid = verifyPassword(password, userRow.password_hash, userRow.password_salt);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      phone: userRow.phone,
      role: userRow.role
    };

    const token = signToken(user);

    res.cookie('lumiere_token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 3600 * 1000,
      sameSite: 'lax'
    });

    res.json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      user,
      token
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get current logged-in user
app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.json({ success: false, user: null });
  }

  const userRow = db.prepare('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!userRow) {
    return res.json({ success: false, user: null });
  }

  res.json({ success: true, user: userRow });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('lumiere_token');
  res.json({ success: true, message: 'Logged out successfully.' });
});

// Check Slot Availability for a date and optional service
app.get('/api/slots/availability', (req, res) => {
  try {
    const { date, service_id } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required (YYYY-MM-DD).' });
    }

    const maxCapacity = getMaxSlotCapacity();

    // Check if the whole date is blocked
    const dayBlocked = db.prepare(
      "SELECT reason FROM blocked_slots WHERE date = ? AND (time_slot IS NULL OR time_slot = '')"
    ).get(date);

    // Get specific slot blocks
    const slotBlocks = db.prepare('SELECT time_slot, reason FROM blocked_slots WHERE date = ?').all(date);
    const blockedSlotMap = {};
    for (const b of slotBlocks) {
      if (b.time_slot) {
        blockedSlotMap[b.time_slot] = b.reason || 'Blocked by Salon Administration';
      }
    }

    // Query bookings for this date and service (or all active bookings if no service specified)
    // Enforces maximum of 3 bookings per service for each date and time slot
    let bookingCounts = {};
    if (service_id) {
      const counts = db.prepare(`
        SELECT time_slot, COUNT(*) as count
        FROM bookings
        WHERE booking_date = ? AND service_id = ? AND status != 'cancelled'
        GROUP BY time_slot
      `).all(date, service_id);

      for (const row of counts) {
        bookingCounts[row.time_slot] = row.count;
      }
    } else {
      // General slot counts
      const counts = db.prepare(`
        SELECT time_slot, COUNT(*) as count
        FROM bookings
        WHERE booking_date = ? AND status != 'cancelled'
        GROUP BY time_slot
      `).all(date);

      for (const row of counts) {
        bookingCounts[row.time_slot] = row.count;
      }
    }

    const slotsResult = STANDARD_TIME_SLOTS.map(slot => {
      const isDateBlocked = !!dayBlocked;
      const isTimeBlocked = !!blockedSlotMap[slot];
      const bookedCount = bookingCounts[slot] || 0;
      const remainingSlots = Math.max(0, maxCapacity - bookedCount);
      const isFull = bookedCount >= maxCapacity;

      let status = 'available';
      let message = `${remainingSlots} slot${remainingSlots === 1 ? '' : 's'} remaining`;

      if (isDateBlocked) {
        status = 'blocked';
        message = dayBlocked.reason || 'Salon is closed on this date';
      } else if (isTimeBlocked) {
        status = 'blocked';
        message = blockedSlotMap[slot];
      } else if (isFull) {
        status = 'fully_booked';
        message = 'This slot is fully booked';
      }

      return {
        time_slot: slot,
        booked_count: bookedCount,
        max_capacity: maxCapacity,
        remaining_slots: remainingSlots,
        status, // 'available' | 'fully_booked' | 'blocked'
        message,
        is_available: status === 'available'
      };
    });

    const alternativeSlots = slotsResult
      .filter(s => s.status === 'available')
      .map(s => s.time_slot);

    res.json({
      success: true,
      date,
      max_capacity: maxCapacity,
      slots: slotsResult,
      alternative_slots: alternativeSlots,
      day_blocked: !!dayBlocked,
      day_blocked_reason: dayBlocked ? dayBlocked.reason : null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Book an appointment
app.post('/api/bookings', (req, res) => {
  try {
    const {
      service_id,
      booking_date,
      time_slot,
      customer_name,
      customer_email,
      customer_phone,
      stylist,
      notes
    } = req.body;

    // Validation
    if (!service_id || !booking_date || !time_slot || !customer_name || !customer_phone) {
      return res.status(400).json({
        success: false,
        message: 'Please complete all required fields (Service, Date, Time Slot, Name, Phone).'
      });
    }

    // Verify service exists
    const service = db.prepare('SELECT * FROM services WHERE id = ? AND is_active = 1').get(service_id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Selected salon service is not available.' });
    }

    // Verify date is not in the past
    const todayStr = new Date().toISOString().slice(0, 10);
    if (booking_date < todayStr) {
      return res.status(400).json({ success: false, message: 'Appointments cannot be booked for past dates.' });
    }

    // Check if slot or day is blocked
    const isBlocked = db.prepare(`
      SELECT reason FROM blocked_slots 
      WHERE date = ? AND (time_slot IS NULL OR time_slot = '' OR time_slot = ?)
    `).get(booking_date, time_slot);

    if (isBlocked) {
      return res.status(400).json({
        success: false,
        message: `This slot is unavailable: ${isBlocked.reason || 'Salon is closed.'}`
      });
    }

    // Prevent double booking for the same customer at the exact same date & time slot
    const cleanPhone = customer_phone.trim();
    const cleanEmail = customer_email ? customer_email.trim().toLowerCase() : '';

    const existingCustomerBooking = db.prepare(`
      SELECT booking_id FROM bookings
      WHERE booking_date = ? AND time_slot = ? AND status != 'cancelled'
      AND (customer_phone = ? OR (customer_email != '' AND customer_email = ?))
    `).get(booking_date, time_slot, cleanPhone, cleanEmail);

    if (existingCustomerBooking) {
      return res.status(400).json({
        success: false,
        message: `You already have an active appointment booked for ${booking_date} at ${time_slot} (Booking ID: ${existingCustomerBooking.booking_id}). Double booking is not allowed.`
      });
    }

    // Enforce maximum capacity per service for this date and time slot (default: 3)
    const maxCapacity = getMaxSlotCapacity();
    const currentBookedCount = db.prepare(`
      SELECT COUNT(*) as count FROM bookings
      WHERE booking_date = ? AND service_id = ? AND time_slot = ? AND status != 'cancelled'
    `).get(booking_date, service_id, time_slot).count;

    if (currentBookedCount >= maxCapacity) {
      // Find alternative available slots on the same date for this service
      const takenSlots = db.prepare(`
        SELECT time_slot, COUNT(*) as count FROM bookings
        WHERE booking_date = ? AND service_id = ? AND status != 'cancelled'
        GROUP BY time_slot
      `).all(booking_date, service_id);

      const takenMap = {};
      for (const t of takenSlots) {
        takenMap[t.time_slot] = t.count;
      }

      const alternatives = STANDARD_TIME_SLOTS.filter(s => s !== time_slot && (takenMap[s] || 0) < maxCapacity);

      return res.status(409).json({
        success: false,
        message: 'This slot is fully booked for this service.',
        is_fully_booked: true,
        alternative_slots: alternatives
      });
    }

    // Generate unique booking ID
    const bookingId = generateBookingId(booking_date);
    const userId = req.user ? req.user.id : null;
    const now = new Date().toISOString();

    const insert = db.prepare(`
      INSERT INTO bookings (
        booking_id, user_id, customer_name, customer_email, customer_phone,
        service_id, service_name, service_price, stylist,
        booking_date, time_slot, notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)
    `);

    insert.run(
      bookingId,
      userId,
      customer_name.trim(),
      cleanEmail,
      cleanPhone,
      service.id,
      service.name,
      service.price,
      stylist || 'Any Available Stylist',
      booking_date,
      time_slot,
      notes ? notes.trim() : '',
      now,
      now
    );

    const newBooking = db.prepare('SELECT * FROM bookings WHERE booking_id = ?').get(bookingId);

    res.status(201).json({
      success: true,
      message: 'Your appointment has been successfully booked!',
      booking: newBooking
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lookup booking for cancellation or details (by booking_id or phone)
app.get('/api/bookings/lookup', (req, res) => {
  try {
    const { booking_id, phone } = req.query;
    if (!booking_id && !phone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide either a Booking ID or registered phone number.'
      });
    }

    if (booking_id) {
      const cleanId = booking_id.trim().toUpperCase();
      const booking = db.prepare('SELECT * FROM bookings WHERE UPPER(booking_id) = ?').get(cleanId);
      if (!booking) {
        return res.status(404).json({ success: false, message: `No appointment found with Booking ID "${booking_id}".` });
      }
      return res.json({ success: true, bookings: [booking] });
    }

    if (phone) {
      // Normalize search query: strip non-digits
      const searchDigits = phone.replace(/\D/g, '');
      const allBookings = db.prepare(`
        SELECT * FROM bookings 
        ORDER BY CASE WHEN status = 'confirmed' THEN 0 ELSE 1 END, booking_date DESC, time_slot ASC
      `).all();

      const matched = allBookings.filter(b => {
        const bDigits = (b.customer_phone || '').replace(/\D/g, '');
        return bDigits.endsWith(searchDigits) || searchDigits.endsWith(bDigits) || bDigits === searchDigits;
      });

      if (!matched || matched.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No appointment found registered with phone number "${phone}".`
        });
      }
      return res.json({ success: true, bookings: matched });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cancel appointment
app.post('/api/bookings/cancel', (req, res) => {
  try {
    const { booking_id, cancel_reason } = req.body;
    if (!booking_id) {
      return res.status(400).json({ success: false, message: 'Booking ID is required to cancel an appointment.' });
    }

    const cleanId = booking_id.trim().toUpperCase();
    const booking = db.prepare('SELECT * FROM bookings WHERE UPPER(booking_id) = ?').get(cleanId);

    if (!booking) {
      return res.status(404).json({ success: false, message: `Booking ID "${booking_id}" not found.` });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This appointment has already been cancelled.' });
    }

    if (booking.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Completed past appointments cannot be cancelled.' });
    }

    const now = new Date().toISOString();
    const reason = cancel_reason ? cancel_reason.trim() : 'Customer requested cancellation';

    db.prepare(`
      UPDATE bookings 
      SET status = 'cancelled', cancel_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(reason, now, booking.id);

    const updatedBooking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);

    res.json({
      success: true,
      message: 'Your appointment has been cancelled successfully. Your time slot has been released.',
      booking: updatedBooking
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// My Appointments (User must be logged in)
app.get('/api/my-appointments', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const userPhone = req.user.phone;

    const appointments = db.prepare(`
      SELECT * FROM bookings 
      WHERE user_id = ? OR customer_email = ? OR (customer_phone != '' AND customer_phone = ?)
      ORDER BY booking_date DESC, time_slot DESC
    `).all(userId, userEmail, userPhone);

    const todayStr = new Date().toISOString().slice(0, 10);

    const upcoming = appointments.filter(a => a.status === 'confirmed' && a.booking_date >= todayStr);
    const completed = appointments.filter(a => a.status === 'completed' || (a.status === 'confirmed' && a.booking_date < todayStr));
    const cancelled = appointments.filter(a => a.status === 'cancelled' || a.status === 'rejected');

    res.json({
      success: true,
      all: appointments,
      upcoming,
      completed,
      cancelled
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Contact message submission
app.post('/api/contact', (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
    }

    db.prepare(`
      INSERT INTO contact_messages (name, email, phone, subject, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'unread', ?)
    `).run(name.trim(), email.trim(), phone ? phone.trim() : '', subject ? subject.trim() : 'General Inquiry', message.trim(), new Date().toISOString());

    res.json({
      success: true,
      message: 'Thank you for reaching out to LUMIÈRE. Our concierge team will contact you promptly!'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------------------------------------------------
// ADMIN API ROUTES (Protected by requireAdmin)
// -------------------------------------------------------------

// Admin Dashboard stats
app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);

    const totalBookings = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
    const todayBookings = db.prepare('SELECT COUNT(*) as c FROM bookings WHERE booking_date = ?').get(todayStr).c;
    const pendingBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'pending'").get().c;
    const confirmedBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'confirmed'").get().c;
    const completedBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'completed'").get().c;
    const cancelledBookings = db.prepare("SELECT COUNT(*) as c FROM bookings WHERE status = 'cancelled' OR status = 'rejected'").get().c;

    const totalRevenue = db.prepare("SELECT SUM(service_price) as sum FROM bookings WHERE status != 'cancelled' AND status != 'rejected'").get().sum || 0;
    const totalCustomers = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'customer'").get().c;
    const totalServices = db.prepare('SELECT COUNT(*) as c FROM services').get().c;

    const todayAppointments = db.prepare(`
      SELECT * FROM bookings 
      WHERE booking_date = ? 
      ORDER BY time_slot ASC
    `).all(todayStr);

    const recentActivity = db.prepare(`
      SELECT * FROM bookings 
      ORDER BY created_at DESC 
      LIMIT 8
    `).all();

    res.json({
      success: true,
      stats: {
        totalBookings,
        todayBookings,
        pendingBookings,
        confirmedBookings,
        completedBookings,
        cancelledBookings,
        totalRevenue: Math.round(totalRevenue),
        totalCustomers,
        totalServices
      },
      todayAppointments,
      recentActivity
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin Manage Bookings: list and search
app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  try {
    const { status, date, search, service_id } = req.query;
    let query = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (date) {
      query += ' AND booking_date = ?';
      params.push(date);
    }
    if (service_id) {
      query += ' AND service_id = ?';
      params.push(service_id);
    }
    if (search) {
      query += ` AND (
        booking_id LIKE ? OR 
        customer_name LIKE ? OR 
        customer_phone LIKE ? OR 
        customer_email LIKE ? OR 
        service_name LIKE ?
      )`;
      const s = `%${search.trim()}%`;
      params.push(s, s, s, s, s);
    }

    query += ' ORDER BY booking_date DESC, time_slot ASC';
    const bookings = db.prepare(query).all(...params);

    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Update Booking Status (confirm, complete, cancel, reject)
app.patch('/api/admin/bookings/:id/status', requireAdmin, (req, res) => {
  try {
    const { status, cancel_reason } = req.body;
    const allowed = ['confirmed', 'completed', 'cancelled', 'rejected', 'pending'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE bookings 
      SET status = ?, cancel_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(status, cancel_reason || booking.cancel_reason, now, req.params.id);

    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);

    res.json({
      success: true,
      message: `Appointment ${booking.booking_id} status updated to ${status}.`,
      booking: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Reschedule Booking
app.patch('/api/admin/bookings/:id/reschedule', requireAdmin, (req, res) => {
  try {
    const { new_date, new_time_slot } = req.body;
    if (!new_date || !new_time_slot) {
      return res.status(400).json({ success: false, message: 'New date and time slot are required.' });
    }

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // Check capacity for new date/time
    const maxCapacity = getMaxSlotCapacity();
    const currentBookings = db.prepare(`
      SELECT COUNT(*) as count FROM bookings
      WHERE booking_date = ? AND time_slot = ? AND service_id = ? AND status != 'cancelled' AND id != ?
    `).get(new_date, new_time_slot, booking.service_id, booking.id).count;

    if (currentBookings >= maxCapacity) {
      return res.status(409).json({
        success: false,
        message: 'The requested new slot is fully booked for this service.'
      });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE bookings 
      SET booking_date = ?, time_slot = ?, status = 'confirmed', updated_at = ?
      WHERE id = ?
    `).run(new_date, new_time_slot, now, booking.id);

    const updated = db.prepare('SELECT * FROM bookings WHERE id = ?').get(booking.id);

    res.json({
      success: true,
      message: `Appointment ${booking.booking_id} rescheduled to ${new_date} at ${new_time_slot}.`,
      booking: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Manage Services (List all including inactive)
app.get('/api/admin/services', requireAdmin, (req, res) => {
  try {
    const services = db.prepare('SELECT * FROM services ORDER BY id DESC').all();
    res.json({ success: true, services });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Add Service
app.post('/api/admin/services', requireAdmin, (req, res) => {
  try {
    const { name, category, description, price, duration, image_url, is_active } = req.body;
    if (!name || !category || !description || price === undefined || !duration) {
      return res.status(400).json({ success: false, message: 'All service fields are required.' });
    }

    const defaultImg = 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80';
    const now = new Date().toISOString();

    const insert = db.prepare(`
      INSERT INTO services (name, category, description, price, duration, image_url, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      name.trim(),
      category.trim(),
      description.trim(),
      parseFloat(price),
      parseInt(duration, 10),
      (image_url && image_url.trim()) || defaultImg,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      now
    );

    const newService = db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      message: 'Service added successfully.',
      service: newService
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Edit Service
app.put('/api/admin/services/:id', requireAdmin, (req, res) => {
  try {
    const { name, category, description, price, duration, image_url, is_active } = req.body;
    const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }

    db.prepare(`
      UPDATE services 
      SET name = ?, category = ?, description = ?, price = ?, duration = ?, image_url = ?, is_active = ?
      WHERE id = ?
    `).run(
      name ? name.trim() : existing.name,
      category ? category.trim() : existing.category,
      description ? description.trim() : existing.description,
      price !== undefined ? parseFloat(price) : existing.price,
      duration !== undefined ? parseInt(duration, 10) : existing.duration,
      image_url ? image_url.trim() : existing.image_url,
      is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);

    res.json({
      success: true,
      message: 'Service updated successfully.',
      service: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Delete Service
app.delete('/api/admin/services/:id', requireAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }

    // Check if bookings exist for this service
    const bookingCount = db.prepare('SELECT COUNT(*) as c FROM bookings WHERE service_id = ?').get(req.params.id).c;
    if (bookingCount > 0) {
      // Soft delete by deactivating so foreign keys remain intact
      db.prepare('UPDATE services SET is_active = 0 WHERE id = ?').run(req.params.id);
      return res.json({
        success: true,
        message: 'Service has existing appointment records and was deactivated instead of permanently deleted.'
      });
    }

    db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Service deleted permanently.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Slot Management Overview
app.get('/api/admin/slots', requireAdmin, (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const maxCapacity = getMaxSlotCapacity();

    // Query active bookings for each slot on this date
    const slotStats = STANDARD_TIME_SLOTS.map(slot => {
      const bookingsForSlot = db.prepare(`
        SELECT id, booking_id, customer_name, customer_phone, service_name, status
        FROM bookings
        WHERE booking_date = ? AND time_slot = ? AND status != 'cancelled'
      `).all(date, slot);

      const bookedCount = bookingsForSlot.length;
      const isFull = bookedCount >= maxCapacity;

      return {
        time_slot: slot,
        booked_count: bookedCount,
        max_capacity: maxCapacity,
        is_full: isFull,
        available_slots: Math.max(0, maxCapacity - bookedCount),
        bookings: bookingsForSlot
      };
    });

    const blocked = db.prepare('SELECT * FROM blocked_slots WHERE date >= ? ORDER BY date ASC').all(date);

    res.json({
      success: true,
      date,
      max_capacity: maxCapacity,
      slots: slotStats,
      blocked_slots: blocked
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Set Max Capacity
app.post('/api/admin/slots/capacity', requireAdmin, (req, res) => {
  try {
    const { max_capacity } = req.body;
    const capacity = parseInt(max_capacity, 10);
    if (!capacity || capacity < 1 || capacity > 20) {
      return res.status(400).json({ success: false, message: 'Capacity must be a number between 1 and 20.' });
    }

    db.prepare("INSERT OR REPLACE INTO shop_settings (key, value) VALUES ('max_slot_capacity', ?)").run(String(capacity));

    res.json({
      success: true,
      message: `Max booking capacity updated to ${capacity} bookings per slot.`,
      max_slot_capacity: capacity
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Block slot or date
app.post('/api/admin/slots/block', requireAdmin, (req, res) => {
  try {
    const { date, time_slot, reason } = req.body;
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required.' });
    }

    const insert = db.prepare(`
      INSERT INTO blocked_slots (date, time_slot, reason, created_at)
      VALUES (?, ?, ?, ?)
    `);

    insert.run(date, time_slot || null, reason ? reason.trim() : 'Maintenance / Closed', new Date().toISOString());

    res.status(201).json({
      success: true,
      message: `Slot/Date successfully blocked.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Unblock slot or date
app.delete('/api/admin/slots/block/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM blocked_slots WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Block removed.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Customers Management
app.get('/api/admin/customers', requireAdmin, (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT u.id, u.name, u.email, u.phone, u.created_at,
             COUNT(b.id) as total_bookings,
             COALESCE(SUM(CASE WHEN b.status != 'cancelled' THEN b.service_price ELSE 0 END), 0) as total_spent
      FROM users u
      LEFT JOIN bookings b ON b.user_id = u.id OR b.customer_email = u.email
      WHERE u.role = 'customer'
    `;
    const params = [];

    if (search) {
      query += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
      const s = `%${search.trim()}%`;
      params.push(s, s, s);
    }

    query += ' GROUP BY u.id ORDER BY total_bookings DESC, u.created_at DESC';

    const customers = db.prepare(query).all(...params);
    res.json({ success: true, customers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Customer Booking History
app.get('/api/admin/customers/:id/history', requireAdmin, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, phone FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const history = db.prepare(`
      SELECT * FROM bookings 
      WHERE user_id = ? OR customer_email = ? OR customer_phone = ?
      ORDER BY booking_date DESC, time_slot DESC
    `).all(user.id, user.email, user.phone);

    res.json({ success: true, customer: user, history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Shop Management (Get and Update)
app.get('/api/admin/shop-settings', requireAdmin, (req, res) => {
  try {
    const settings = getShopSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/shop-settings', requireAdmin, (req, res) => {
  try {
    const {
      salon_name,
      tagline,
      phone,
      email,
      address,
      hours_mon_fri,
      hours_sat,
      hours_sun,
      about_story,
      facilities,
      holidays
    } = req.body;

    const insertOrUpdate = db.prepare('INSERT OR REPLACE INTO shop_settings (key, value) VALUES (?, ?)');

    if (salon_name) insertOrUpdate.run('salon_name', salon_name.trim());
    if (tagline) insertOrUpdate.run('tagline', tagline.trim());
    if (phone) insertOrUpdate.run('phone', phone.trim());
    if (email) insertOrUpdate.run('email', email.trim());
    if (address) insertOrUpdate.run('address', address.trim());
    if (hours_mon_fri) insertOrUpdate.run('hours_mon_fri', hours_mon_fri.trim());
    if (hours_sat) insertOrUpdate.run('hours_sat', hours_sat.trim());
    if (hours_sun) insertOrUpdate.run('hours_sun', hours_sun.trim());
    if (about_story) insertOrUpdate.run('about_story', about_story.trim());
    if (facilities) insertOrUpdate.run('facilities', facilities.trim());
    if (holidays) insertOrUpdate.run('holidays', holidays.trim());

    res.json({
      success: true,
      message: 'Salon shop settings updated successfully.',
      settings: getShopSettings()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: Analytics & Reports
app.get('/api/admin/reports', requireAdmin, (req, res) => {
  try {
    const { period = 'daily' } = req.query;

    // Revenue and booking counts by date (last 14 days)
    const bookingsTrend = db.prepare(`
      SELECT booking_date, 
             COUNT(*) as total_bookings,
             SUM(CASE WHEN status != 'cancelled' AND status != 'rejected' THEN service_price ELSE 0 END) as revenue,
             SUM(CASE WHEN status = 'cancelled' OR status = 'rejected' THEN 1 ELSE 0 END) as cancelled_count
      FROM bookings
      GROUP BY booking_date
      ORDER BY booking_date DESC
      LIMIT 14
    `).all().reverse();

    // Top services by booking volume
    const topServices = db.prepare(`
      SELECT service_name, COUNT(*) as count, SUM(service_price) as revenue
      FROM bookings
      WHERE status != 'cancelled'
      GROUP BY service_name
      ORDER BY count DESC
      LIMIT 5
    `).all();

    // Status breakdown
    const statusBreakdown = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM bookings
      GROUP BY status
    `).all();

    // Recent contact inquiries
    const recentMessages = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 5').all();

    res.json({
      success: true,
      period,
      bookingsTrend,
      topServices,
      statusBreakdown,
      recentMessages
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Catch-all route to serve SPA index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LUMIÈRE Salon Booking Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;

