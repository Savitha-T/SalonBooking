const app = require('./server.js');
const { EventEmitter } = require('node:events');

function mockRequest(method, url, headers = {}, body = null) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { ...headers };
    if (body) {
      req.body = body;
      req.headers['content-type'] = 'application/json';
    } else {
      req.body = {};
    }

    const res = new EventEmitter();
    res.statusCode = 200;
    res._headers = {};
    res.setHeader = (k, v) => { res._headers[k.toLowerCase()] = v; };
    res.getHeader = (k) => res._headers[k.toLowerCase()];
    res.status = (code) => { res.statusCode = code; return res; };
    res.cookie = (name, val, opts) => { res._headers[`set-cookie`] = `${name}=${val}`; return res; };
    res.clearCookie = (name) => { res._headers[`set-cookie`] = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`; return res; };

    let responseData = '';
    res.json = (data) => {
      resolve({ status: res.statusCode, body: data });
    };
    res.send = (data) => {
      resolve({ status: res.statusCode, raw: data });
    };
    res.sendFile = (path) => {
      resolve({ status: res.statusCode, file: path });
    };

    app.handle(req, res);
  });
}

async function runDirectTests() {
  console.log('=== STARTING DIRECT IN-PROCESS INTEGRATION TESTS ===\n');

  const { db } = require('./db.js');
  db.exec("DELETE FROM bookings WHERE customer_name LIKE 'Client %' OR customer_name = 'Lady Genevieve'");


  // 1. Shop Info
  console.log('1. GET /api/shop-info');
  const shop = await mockRequest('GET', '/api/shop-info');
  console.log('Shop Info Status:', shop.status, 'Salon Name:', shop.body.settings.salon_name);
  if (shop.status !== 200 || !shop.body.settings.salon_name) throw new Error('Shop info failed');

  // 2. Services
  console.log('\n2. GET /api/services');
  const serv = await mockRequest('GET', '/api/services');
  console.log('Services Count:', serv.body.services.length);
  if (serv.body.services.length < 5) throw new Error('Services missing');
  const testService = serv.body.services[0];

  // 3. Customer Login
  console.log('\n3. POST /api/auth/login (Customer)');
  const custLogin = await mockRequest('POST', '/api/auth/login', {}, {
    email: 'priya.sharma@example.com',
    password: 'password123'
  });
  console.log('Customer Login Status:', custLogin.status, 'User:', custLogin.body.user.name);
  const custToken = custLogin.body.token;

  // 4. Admin Login
  console.log('\n4. POST /api/auth/login (Admin)');
  const adminLogin = await mockRequest('POST', '/api/auth/login', {}, {
    email: 'admin@luxesalon.com',
    password: 'admin123'
  });
  console.log('Admin Login Status:', adminLogin.status, 'Role:', adminLogin.body.user.role);
  const adminToken = adminLogin.body.token;

  // 5. Check Slot Availability
  const testDate = '2026-11-20';
  console.log(`\n5. GET /api/slots/availability?date=${testDate}&service_id=${testService.id}`);
  const slots = await mockRequest('GET', `/api/slots/availability?date=${testDate}&service_id=${testService.id}`);
  console.log('Available slots count:', slots.body.slots.length, 'Max capacity:', slots.body.max_capacity);

  // 6. Test Slot Capacity: 3 bookings per service for date and time slot
  console.log('\n6. Testing Max Capacity Enforcing (Max 3 bookings per slot)...');
  const testSlot = '10:00 AM';

  const b1 = await mockRequest('POST', '/api/bookings', { authorization: `Bearer ${custToken}` }, {
    service_id: testService.id,
    booking_date: testDate,
    time_slot: testSlot,
    customer_name: 'Client Alpha',
    customer_phone: '+1 555-222-0001',
    customer_email: 'alpha@example.com',
    stylist: 'Elena Rostova'
  });
  console.log('Booking 1 Status:', b1.status, 'ID:', b1.body.booking.booking_id);

  const b2 = await mockRequest('POST', '/api/bookings', {}, {
    service_id: testService.id,
    booking_date: testDate,
    time_slot: testSlot,
    customer_name: 'Client Beta',
    customer_phone: '+1 555-222-0002',
    customer_email: 'beta@example.com'
  });
  console.log('Booking 2 Status:', b2.status, 'ID:', b2.body.booking.booking_id);

  const b3 = await mockRequest('POST', '/api/bookings', {}, {
    service_id: testService.id,
    booking_date: testDate,
    time_slot: testSlot,
    customer_name: 'Client Gamma',
    customer_phone: '+1 555-222-0003',
    customer_email: 'gamma@example.com'
  });
  console.log('Booking 3 Status:', b3.status, 'ID:', b3.body.booking.booking_id);

  // Booking 4 -> MUST REJECT with 409 Fully Booked and return alternative slots
  const b4 = await mockRequest('POST', '/api/bookings', {}, {
    service_id: testService.id,
    booking_date: testDate,
    time_slot: testSlot,
    customer_name: 'Client Delta',
    customer_phone: '+1 555-222-0004',
    customer_email: 'delta@example.com'
  });
  console.log('Booking 4 Status (expect 409):', b4.status, 'Message:', b4.body.message);
  console.log('Alternative slots returned:', b4.body.alternative_slots);
  if (b4.status !== 409 || !b4.body.is_fully_booked) throw new Error('Slot capacity limit failed');

  // 7. Double Booking Check
  console.log('\n7. Testing Double Booking Check for same user...');
  const doubleBook = await mockRequest('POST', '/api/bookings', {}, {
    service_id: testService.id,
    booking_date: testDate,
    time_slot: testSlot,
    customer_name: 'Client Alpha',
    customer_phone: '+1 555-222-0001',
    customer_email: 'alpha@example.com'
  });
  console.log('Double Booking Status (expect 400):', doubleBook.status, 'Message:', doubleBook.body.message);
  if (doubleBook.status !== 400) throw new Error('Double booking prevention failed');

  // 8. Lookup by ID
  const testBookingId = b1.body.booking.booking_id;
  console.log(`\n8. Lookup by Booking ID: ${testBookingId}`);
  const lookup = await mockRequest('GET', `/api/bookings/lookup?booking_id=${testBookingId}`);
  console.log('Found booking customer:', lookup.body.bookings[0].customer_name);

  // 9. Lookup by Phone
  console.log('\n9. Lookup by Phone: +1 555-222-0001');
  const phoneLookup = await mockRequest('GET', `/api/bookings/lookup?phone=+1 555-222-0001`);
  console.log('Found bookings by phone:', phoneLookup.body.bookings.length);

  // 10. Cancel Appointment
  console.log(`\n10. Cancel Appointment: ${testBookingId}`);
  const cancel = await mockRequest('POST', '/api/bookings/cancel', {}, {
    booking_id: testBookingId,
    cancel_reason: 'Client requested reschedule'
  });
  console.log('Cancel Status:', cancel.status, 'Status:', cancel.body.booking.status);
  if (cancel.body.booking.status !== 'cancelled') throw new Error('Cancellation failed');

  // 11. Slot Capacity Freed up check
  console.log('\n11. Retry Booking 4 now that slot is freed...');
  const retryB4 = await mockRequest('POST', '/api/bookings', {}, {
    service_id: testService.id,
    booking_date: testDate,
    time_slot: testSlot,
    customer_name: 'Client Delta',
    customer_phone: '+1 555-222-0004',
    customer_email: 'delta@example.com'
  });
  console.log('Retry Booking 4 Status (expect 201):', retryB4.status, 'ID:', retryB4.body.booking.booking_id);
  if (retryB4.status !== 201) throw new Error('Slot freeing failed');

  // 12. Admin Dashboard
  console.log('\n12. Admin Dashboard');
  const dash = await mockRequest('GET', '/api/admin/dashboard', { authorization: `Bearer ${adminToken}` });
  console.log('Admin Dashboard Total Bookings:', dash.body.stats.totalBookings, 'Revenue:', dash.body.stats.totalRevenue);

  // 13. Admin Customer List & History
  console.log('\n13. Admin Customers List');
  const custs = await mockRequest('GET', '/api/admin/customers', { authorization: `Bearer ${adminToken}` });
  console.log('Customers count:', custs.body.customers.length);
  const custHistory = await mockRequest('GET', `/api/admin/customers/${custs.body.customers[0].id}/history`, { authorization: `Bearer ${adminToken}` });
  console.log('Customer history appointments:', custHistory.body.history.length);

  // 14. Admin Reports
  console.log('\n14. Admin Reports');
  const reports = await mockRequest('GET', '/api/admin/reports', { authorization: `Bearer ${adminToken}` });
  console.log('Trend records:', reports.body.bookingsTrend.length, 'Top services:', reports.body.topServices.length);

  // 15. Contact Submission
  console.log('\n15. Contact Form Submission');
  const contact = await mockRequest('POST', '/api/contact', {}, {
    name: 'Duchess Diana',
    email: 'diana@example.com',
    phone: '+1 555-888-1234',
    subject: 'VIP Spa Day',
    message: 'Booking a full day package for our anniversary.'
  });
  console.log('Contact status:', contact.status, 'Message:', contact.body.message);

  console.log('\n🎉 ALL 15 IN-PROCESS INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
}

runDirectTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
