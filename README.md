# LUMIÈRE Luxury Unisex Salon & Spa - Web Booking Application (India Edition)

A full-stack salon appointment booking web application tailored for India, featuring Indian services, Indian Rupee (`₹` INR) pricing, Indian location and contacts, responsive UI/UX, customer reservation flow, real-time slot availability checking, appointment cancellation, and an Admin Panel.

---

## 🇮🇳 India-Specific Localization & Services

### 📍 Salon Address & Contact
- **Address:** Plot No. 42, 100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038
- **Landmark:** Opposite Metro Pillar 84, Indiranagar
- **Phone:** `+91 98765 43210`
- **Email:** `concierge@lumieresalon.in`
- **Working Hours:**
  - Monday – Friday: 09:00 AM – 08:30 PM
  - Saturday: 09:00 AM – 08:00 PM
  - Sunday: 10:00 AM – 07:00 PM
- **Observed Holidays:** Diwali, Pongal / Makar Sankranti, Independence Day (Aug 15), Republic Day (Jan 26)

---

### ✂️ Popular Indian Salon Services & Pricing (INR)

| Service Name | Category | Duration | Price (INR) |
| :--- | :--- | :--- | :--- |
| **Men’s Classic Haircut, Beard Trim & Hot Towel** | Men’s Grooming | 35 mins | **₹350** |
| **Women’s Advanced Layer Cut & Blowdry Style** | Hair Styling & Cut | 45 mins | **₹650** |
| **L’Oréal Professionnel Deep Nourishing Hair Spa** | Hair Spa & Keratin | 60 mins | **₹999** |
| **O3+ Bridal Radiance Glow & De-Tan Facial** | Facials & De-Tan | 60 mins | **₹1,499** |
| **Keratin Protein Hair Smoothening Treatment** | Hair Spa & Keratin | 150 mins | **₹3,499** |
| **Global Hair Color & Ammonia-Free Root Touch-Up** | Hair Coloring | 90 mins | **₹1,850** |
| **Traditional Ayurvedic Kesh Champi Head Massage** | Spa & Champi | 30 mins | **₹499** |
| **Lotus Botanical De-Tan Bleach & Face Pack** | Facials & De-Tan | 35 mins | **₹550** |
| **Rose Water & Honey Pedicure + Manicure Duo** | Pedicure & Manicure | 60 mins | **₹799** |
| **Full Arms & Legs Rica Waxing + Eyebrow Threading** | Waxing & Threading | 45 mins | **₹899** |
| **Aroma Stress-Relief Full Body Swedish Massage** | Spa & Champi | 60 mins | **₹1,899** |
| **Royal Bridal Makeover & Saree Draping Package** | Bridal & Saree Draping | 180 mins | **₹7,500** |

---

## 🌟 Key Application Features

1. **User Authentication:** Registration & login with encrypted password hashing (`node:crypto` scrypt). Supports role-based access for Customers and Admins.
2. **Home Page:** Obsidian & champagne gold luxury salon theme, live stats, quick booking widget, featured Indian services, and testimonials from clients in Bengaluru.
3. **Services Catalog:** 12 Indian services across 9 categories with instant search, category filters, and direct 1-click booking pre-selection.
4. **Appointment Booking Flow:**
   - 11 time slots (09:00 AM to 07:00 PM).
   - Enforces a maximum of **3 bookings per service for each date and time slot**.
   - If full, displays: **`This slot is fully booked`** and shows alternative slots on that date.
   - Prevents double bookings for the same customer at the same time.
   - Generates a digital confirmation pass / receipt with Booking ID (e.g. `LUMI-20261102-IN01`).
5. **Cancel Appointment:** Cancel using either **Unique Booking ID** OR **Registered Mobile Number**, with full details preview and immediate slot release in SQLite.
6. **About Shop:** Heritage story, master stylists (Kavita Nair, Arjun Kapoor, Meera Sen, Rajesh Kumar), Bengaluru location, and operating hours.
7. **Contact Page:** Indian phone, email, address, and interactive contact form with DB persistence.
8. **My Appointments:** Filter by Upcoming, Completed, and Cancelled appointments with pass view and rebook options.
9. **Separate Admin Panel (`#/admin`):**
   - Dashboard with revenue tracking in ₹ INR, today's schedule, and recent bookings.
   - Bookings management with Confirm, Complete, Reschedule, and Cancel actions.
   - Services CRUD (add, edit, price in ₹, duration, delete).
   - Slot capacity configuration (default: 3) & date/slot blocking.
   - Customer profiles and appointment history modal.
   - Shop settings editor (updates reflect on website instantly).
   - Reports & Analytics with Chart.js trend charts and top services rankings.

---

## 🔑 Pre-Seeded Test Credentials

| Role | Email | Password | Pre-loaded Data |
| :--- | :--- | :--- | :--- |
| **Salon Master Admin** | `admin@luxesalon.com` | `admin123` | Full Administrative Dashboard & Controls |
| **Customer (Priya Sharma)** | `priya.sharma@example.com` | `password123` | Active upcoming and completed appointments in Bengaluru |

*(Quick-fill buttons are available on the Sign In modal for 1-click testing).*

---

## 🚀 How to Run

1. In PowerShell:
   ```powershell
   node server.js
   ```
2. Open your browser:
   - **Customer Portal:** `http://localhost:3000`
   - **Admin Portal:** `http://localhost:3000/#admin`
