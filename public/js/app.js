/**
 * LUMIÈRE LUXURY SALON & SPA - CLIENT FRONTEND LOGIC (app.js)
 */

// Application State
const state = {
  currentUser: null,
  shopSettings: {},
  services: [],
  selectedCategory: 'All',
  booking: {
    selectedService: null,
    date: null,
    timeSlot: null,
    stylist: 'Any Available Master Stylist'
  },
  cancelSearchResults: []
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  // Setup today's minimum date for booking
  const todayStr = new Date().toISOString().slice(0, 10);
  const bookingDateEl = document.getElementById('bookingDateInput');
  const quickDateEl = document.getElementById('quickDateInput');
  if (bookingDateEl) {
    bookingDateEl.min = todayStr;
    bookingDateEl.value = todayStr;
  }
  if (quickDateEl) {
    quickDateEl.min = todayStr;
    quickDateEl.value = todayStr;
  }

  // Load shop settings, current auth, and services
  await checkCurrentUser();
  await loadShopSettings();
  await loadServices();

  // Handle URL hash navigation
  handleHashChange();
  window.addEventListener('hashchange', handleHashChange);
});

// Toast notification helper
function showToast(message, type = 'gold') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'fa-solid fa-circle-check';
  if (type === 'error' || type === 'danger') icon = 'fa-solid fa-circle-xmark';
  if (type === 'warning') icon = 'fa-solid fa-triangle-exclamation';

  toast.innerHTML = `
    <i class="${icon}" style="font-size: 1.2rem; margin-top: 2px;"></i>
    <div style="flex: 1;">
      <p style="margin: 0; font-size: 0.9rem; color: #fff;">${message}</p>
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// -------------------------------------------------------------
// NAVIGATION & ROUTING
// -------------------------------------------------------------

function navigateTo(pageId) {
  // Hide customer app if entering admin
  if (pageId === 'admin') {
    openAdminPanel();
    return;
  }

  // Close mobile nav if open
  const navMenu = document.getElementById('navMenu');
  if (navMenu) navMenu.classList.remove('open');

  // Update navbar active link
  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.dataset.page === pageId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Switch visible section
  document.querySelectorAll('.page-view').forEach(view => {
    view.style.display = 'none';
  });

  const targetView = document.getElementById(`page-${pageId}`);
  if (targetView) {
    targetView.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Specific triggers per page
  if (pageId === 'my-appointments') {
    loadMyAppointments();
  } else if (pageId === 'booking') {
    if (!state.booking.date) {
      const todayStr = new Date().toISOString().slice(0, 10);
      state.booking.date = todayStr;
      const dateEl = document.getElementById('bookingDateInput');
      if (dateEl) dateEl.value = todayStr;
    }
    fetchSlotAvailability();
  }

  // Update hash without jump
  if (history.pushState) {
    history.pushState(null, null, `#${pageId}`);
  } else {
    location.hash = `#${pageId}`;
  }
}

function handleHashChange() {
  const hash = window.location.hash.replace('#', '') || 'home';
  if (hash === 'admin') {
    openAdminPanel();
  } else {
    // If admin is active, close it
    const adminApp = document.getElementById('adminApp');
    const customerApp = document.getElementById('customerApp');
    if (adminApp && adminApp.style.display !== 'none') {
      adminApp.style.display = 'none';
      customerApp.style.display = 'block';
    }
    navigateTo(hash);
  }
}

function toggleMobileNav() {
  const menu = document.getElementById('navMenu');
  if (menu) menu.classList.toggle('open');
}

// -------------------------------------------------------------
// SHOP SETTINGS & INITIAL DATA
// -------------------------------------------------------------

async function loadShopSettings() {
  try {
    const res = await fetch('/api/shop-info');
    const data = await res.json();
    if (data.success && data.settings) {
      state.shopSettings = data.settings;
      renderShopSettings(data.settings);
    }
  } catch (err) {
    console.error('Error loading shop settings:', err);
  }
}

function renderShopSettings(s) {
  if (!s) return;
  // Header
  const headerTagline = document.getElementById('headerTagline');
  if (headerTagline && s.tagline) headerTagline.innerText = s.tagline;

  // Banner
  const bannerHours = document.getElementById('bannerHours');
  if (bannerHours) {
    bannerHours.innerText = `Mon - Fri: ${s.hours_mon_fri || '9:00 AM - 8:00 PM'} | Sat: ${s.hours_sat || '9:00 AM - 7:00 PM'} | Sun: ${s.hours_sun || '10:00 AM - 6:00 PM'}`;
  }

  // About Page
  const aboutStory = document.getElementById('aboutShopStory');
  if (aboutStory && s.about_story) aboutStory.innerText = s.about_story;

  const aboutFacilities = document.getElementById('aboutShopFacilities');
  if (aboutFacilities && s.facilities) aboutFacilities.innerText = s.facilities;

  const aboutAddress = document.getElementById('aboutShopAddress');
  if (aboutAddress && s.address) aboutAddress.innerText = s.address;

  const aboutHolidays = document.getElementById('aboutShopHolidays');
  if (aboutHolidays && s.holidays) aboutHolidays.innerText = s.holidays;

  // Hours
  if (s.hours_mon_fri) {
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].forEach(day => {
      const el = document.getElementById(`hourVal${day}`);
      if (el) el.innerText = s.hours_mon_fri;
    });
  }
  if (s.hours_sat) {
    const el = document.getElementById('hourValSat');
    if (el) el.innerText = s.hours_sat;
  }
  if (s.hours_sun) {
    const el = document.getElementById('hourValSun');
    if (el) el.innerText = s.hours_sun;
  }

  // Highlight today's row in hours table
  const dayOfWeek = new Date().getDay(); // 0 is Sun, 1 is Mon...
  const dayIds = ['hoursSun', 'hoursMon', 'hoursTue', 'hoursWed', 'hoursThu', 'hoursFri', 'hoursSat'];
  dayIds.forEach((id, idx) => {
    const row = document.getElementById(id);
    if (row) {
      if (idx === dayOfWeek) {
        row.classList.add('highlight');
      } else {
        row.classList.remove('highlight');
      }
    }
  });

  // Contact Page
  const cPhone = document.getElementById('contactCardPhone');
  if (cPhone && s.phone) cPhone.innerText = s.phone;
  const cEmail = document.getElementById('contactCardEmail');
  if (cEmail && s.email) cEmail.innerText = s.email;
  const cAddr = document.getElementById('contactCardAddress');
  if (cAddr && s.address) cAddr.innerText = s.address;
}

// -------------------------------------------------------------
// SERVICES CATALOG
// -------------------------------------------------------------

async function loadServices() {
  try {
    const res = await fetch('/api/services');
    const data = await res.json();
    if (data.success && data.services) {
      state.services = data.services;
      renderServicesCatalog();
      populateServiceDropdowns();
    }
  } catch (err) {
    console.error('Error loading services:', err);
  }
}

function populateServiceDropdowns() {
  const quickSelect = document.getElementById('quickServiceSelect');
  const bookingSelect = document.getElementById('bookingServiceSelect');

  const optionsHtml = state.services.map(s => 
    `<option value="${s.id}" data-price="${s.price}" data-duration="${s.duration}" data-name="${s.name}">
      ${s.name} - ₹${s.price.toLocaleString('en-IN')} (${s.duration} min)
    </option>`
  ).join('');

  if (quickSelect) {
    quickSelect.innerHTML = '<option value="">-- Choose a Luxury Service --</option>' + optionsHtml;
  }
  if (bookingSelect) {
    bookingSelect.innerHTML = '<option value="">-- Choose from our Service Menu --</option>' + optionsHtml;
  }
}

function renderServicesCatalog() {
  const homeGrid = document.getElementById('homeFeaturedServices');
  const servicesGrid = document.getElementById('servicesPageGrid');

  // Featured for home: top 6
  if (homeGrid) {
    const featured = state.services.slice(0, 6);
    homeGrid.innerHTML = featured.map(s => createServiceCardHtml(s)).join('');
  }

  // Filtered for services page
  filterServices();
}

function createServiceCardHtml(s) {
  return `
    <div class="service-card" data-service-id="${s.id}">
      <div class="service-card-img-wrap">
        <img src="${s.image_url}" class="service-card-img" alt="${s.name}" loading="lazy">
        <span class="badge badge-gold service-card-category">${s.category}</span>
        <span class="service-card-price">₹${s.price.toLocaleString('en-IN')}</span>
      </div>
      <div class="service-card-body">
        <h3 class="service-card-title font-serif">${s.name}</h3>
        <p class="service-card-desc">${s.description}</p>
        <div class="service-card-footer">
          <span class="service-duration"><i class="fa-regular fa-clock text-gold"></i> ${s.duration} Minutes</span>
          <button class="btn btn-primary btn-sm" onclick="bookThisSpecificService(${s.id})">
            <i class="fa-regular fa-calendar-check"></i> Book Now
          </button>
        </div>
      </div>
    </div>
  `;
}

function setCategoryFilter(category, btnEl) {
  state.selectedCategory = category;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  filterServices();
}

function filterServices() {
  const searchInput = document.getElementById('serviceSearchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const grid = document.getElementById('servicesPageGrid');
  if (!grid) return;

  const filtered = state.services.filter(s => {
    const matchCategory = state.selectedCategory === 'All' || s.category === state.selectedCategory;
    const matchSearch = !query || 
      s.name.toLowerCase().includes(query) || 
      s.description.toLowerCase().includes(query) ||
      s.category.toLowerCase().includes(query);
    return matchCategory && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem;">
        <i class="fa-solid fa-magnifying-glass" style="font-size: 2.5rem; color: var(--gold-border); margin-bottom: 1rem;"></i>
        <h4 class="font-serif" style="font-size: 1.4rem; color: #fff;">No salon services match your search</h4>
        <p style="color: var(--text-dim); margin-top: 0.5rem;">Try choosing another category or clearing your search term.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(s => createServiceCardHtml(s)).join('');
}

function bookThisSpecificService(serviceId) {
  const service = state.services.find(s => s.id === serviceId);
  if (!service) return;

  navigateTo('booking');
  const selectEl = document.getElementById('bookingServiceSelect');
  if (selectEl) {
    selectEl.value = service.id;
    handleServiceChange();
  }
}

// -------------------------------------------------------------
// APPOINTMENT BOOKING FLOW & SLOT AVAILABILITY
// -------------------------------------------------------------

function handleServiceChange() {
  const selectEl = document.getElementById('bookingServiceSelect');
  const selectedOption = selectEl.options[selectEl.selectedIndex];

  if (!selectEl.value) {
    state.booking.selectedService = null;
    updateBookingSummary();
    const hint = document.getElementById('serviceMetaHint');
    if (hint) hint.style.display = 'none';
    return;
  }

  const service = state.services.find(s => s.id === parseInt(selectEl.value, 10));
  if (service) {
    state.booking.selectedService = service;
    const hint = document.getElementById('serviceMetaHint');
    if (hint) {
      hint.innerText = `${service.category} • ${service.duration} mins • ₹${service.price.toLocaleString('en-IN')}`;
      hint.style.display = 'block';
    }
  }

  updateBookingSummary();
  fetchSlotAvailability();
}

function handleQuickBookRedirect() {
  const serviceId = document.getElementById('quickServiceSelect').value;
  const dateVal = document.getElementById('quickDateInput').value;
  const timeSlot = document.getElementById('quickTimeSlot').value;

  navigateTo('booking');

  if (serviceId) {
    const selectEl = document.getElementById('bookingServiceSelect');
    if (selectEl) selectEl.value = serviceId;
    handleServiceChange();
  }
  if (dateVal) {
    const dateEl = document.getElementById('bookingDateInput');
    if (dateEl) dateEl.value = dateVal;
  }

  state.booking.timeSlot = timeSlot;
  fetchSlotAvailability();
}

async function fetchSlotAvailability() {
  const serviceId = document.getElementById('bookingServiceSelect')?.value;
  const dateInput = document.getElementById('bookingDateInput');
  const slotsGrid = document.getElementById('slotsGridContainer');
  const indicator = document.getElementById('slotStatusIndicator');
  const alertContainer = document.getElementById('slotAlertContainer');

  if (!dateInput || !slotsGrid) return;
  const dateVal = dateInput.value;
  state.booking.date = dateVal;

  if (!dateVal) {
    slotsGrid.innerHTML = '<p style="grid-column: 1 / -1; color: var(--text-muted);">Please select a date above.</p>';
    return;
  }

  if (indicator) indicator.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking availability...';

  try {
    let url = `/api/slots/availability?date=${dateVal}`;
    if (serviceId) url += `&service_id=${serviceId}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) {
      slotsGrid.innerHTML = `<p style="grid-column: 1 / -1; color: var(--danger);">${data.message}</p>`;
      if (indicator) indicator.innerHTML = '';
      return;
    }

    if (indicator) {
      indicator.innerHTML = `<i class="fa-solid fa-circle-check text-gold"></i> Live Capacity: Max ${data.max_capacity} bookings/slot`;
    }

    renderSlotsGrid(data.slots, data.alternative_slots, data.day_blocked, data.day_blocked_reason);
  } catch (err) {
    console.error('Error fetching slots:', err);
    slotsGrid.innerHTML = '<p style="grid-column: 1 / -1; color: var(--danger);">Failed to load time slots. Please try again.</p>';
  }
}

function renderSlotsGrid(slots, alternativeSlots, dayBlocked, dayReason) {
  const slotsGrid = document.getElementById('slotsGridContainer');
  const alertContainer = document.getElementById('slotAlertContainer');
  if (!slotsGrid) return;

  if (dayBlocked) {
    slotsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); border-radius: var(--radius-md); padding: 1.5rem; text-align: center;">
        <i class="fa-solid fa-calendar-xmark" style="font-size: 2rem; color: var(--danger); margin-bottom: 0.5rem;"></i>
        <h4 style="color: #fff; margin-bottom: 0.3rem;">Salon Closed on this Date</h4>
        <p style="color: var(--text-muted); font-size: 0.9rem;">${dayReason || 'No appointments can be scheduled on this day.'}</p>
      </div>
    `;
    if (alertContainer) alertContainer.style.display = 'none';
    return;
  }

  slotsGrid.innerHTML = slots.map(slot => {
    const isSelected = state.booking.timeSlot === slot.time_slot && slot.is_available;
    const isFull = slot.status === 'fully_booked';
    const isBlocked = slot.status === 'blocked';
    const isDisabled = !slot.is_available;

    let statusText = `${slot.remaining_slots} slot${slot.remaining_slots === 1 ? '' : 's'} left`;
    let badgeStyle = 'color: var(--text-dim);';

    if (isFull) {
      statusText = 'Fully Booked';
      badgeStyle = 'color: var(--danger); font-weight: 700;';
    } else if (isBlocked) {
      statusText = 'Unavailable';
      badgeStyle = 'color: var(--warning);';
    } else if (slot.remaining_slots === 1) {
      statusText = 'Only 1 left!';
      badgeStyle = 'color: var(--warning); font-weight: 700;';
    }

    return `
      <div class="time-slot-btn ${isDisabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}" 
           onclick="selectTimeSlot('${slot.time_slot}', ${slot.is_available}, ${isFull})">
        <span class="slot-time">${slot.time_slot}</span>
        <span class="slot-status-text" style="${badgeStyle}">${statusText}</span>
      </div>
    `;
  }).join('');

  // Update alert container if current selected slot or any slot was full
  renderSlotAlert(slots, alternativeSlots);
}

function selectTimeSlot(slot, isAvailable, isFull) {
  const alertContainer = document.getElementById('slotAlertContainer');

  if (!isAvailable) {
    if (isFull) {
      showToast('This slot is fully booked. Please choose an alternative available slot highlighted below.', 'warning');
      displayFullyBookedAlert(slot);
    } else {
      showToast('This slot is currently unavailable.', 'warning');
    }
    return;
  }

  state.booking.timeSlot = slot;
  const inputEl = document.getElementById('selectedTimeSlotInput');
  if (inputEl) inputEl.value = slot;

  // Re-render slots to highlight selected
  document.querySelectorAll('.time-slot-btn').forEach(btn => {
    const timeSpan = btn.querySelector('.slot-time');
    if (timeSpan && timeSpan.innerText === slot) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });

  if (alertContainer) alertContainer.style.display = 'none';
  updateBookingSummary();
}

function displayFullyBookedAlert(fullSlot) {
  const alertContainer = document.getElementById('slotAlertContainer');
  if (!alertContainer) return;

  // Get available slots
  const availableBtns = Array.from(document.querySelectorAll('.time-slot-btn:not(.disabled) .slot-time')).map(el => el.innerText);

  alertContainer.innerHTML = `
    <div class="slot-alert-box">
      <h5><i class="fa-solid fa-circle-exclamation"></i> This slot (${fullSlot}) is fully booked</h5>
      <p style="font-size: 0.85rem; color: #fca5a5; margin: 0;">
        A maximum of 3 clients are scheduled for this service at ${fullSlot}. Please select one of these recommended alternative available slots for today:
      </p>
      <div class="alternative-slots-chips">
        ${availableBtns.length > 0 
          ? availableBtns.map(s => `<button type="button" class="alt-chip" onclick="selectTimeSlot('${s}', true, false)"><i class="fa-regular fa-clock"></i> ${s}</button>`).join('')
          : '<span style="font-size: 0.82rem; color: #cbd5e1;">No other slots available today. Please select the next available date.</span>'
        }
      </div>
    </div>
  `;
  alertContainer.style.display = 'block';
}

function renderSlotAlert(slots, alternativeSlots) {
  const alertContainer = document.getElementById('slotAlertContainer');
  if (!alertContainer) return;

  const hasFullyBooked = slots.some(s => s.status === 'fully_booked');
  if (!hasFullyBooked) {
    alertContainer.style.display = 'none';
  }
}

function updateBookingSummary() {
  const s = state.booking.selectedService;
  const nameEl = document.getElementById('summaryServiceName');
  const durEl = document.getElementById('summaryDuration');
  const dateEl = document.getElementById('summaryDate');
  const slotEl = document.getElementById('summaryTimeSlot');
  const priceEl = document.getElementById('summaryPrice');
  const stylistEl = document.getElementById('summaryStylist');
  const stylistSelect = document.getElementById('bookingStylistSelect');

  if (nameEl) nameEl.innerText = s ? s.name : 'None selected';
  if (durEl) durEl.innerText = s ? `${s.duration} mins` : '--';
  if (priceEl) priceEl.innerText = s ? `₹${s.price.toLocaleString('en-IN')}` : '₹0.00';
  if (dateEl) dateEl.innerText = state.booking.date || '--';
  if (slotEl) slotEl.innerText = state.booking.timeSlot || '--';

  const stylistVal = stylistSelect ? stylistSelect.value : 'Any Available';
  if (stylistEl) stylistEl.innerText = stylistVal;
}

// Booking Form Submission
async function handleAppointmentSubmit(e) {
  e.preventDefault();

  const serviceId = document.getElementById('bookingServiceSelect').value;
  const bookingDate = document.getElementById('bookingDateInput').value;
  const timeSlot = state.booking.timeSlot;
  const customerName = document.getElementById('bookingCustomerName').value;
  const customerPhone = document.getElementById('bookingCustomerPhone').value;
  const customerEmail = document.getElementById('bookingCustomerEmail').value;
  const stylist = document.getElementById('bookingStylistSelect').value;
  const notes = document.getElementById('bookingNotes').value;

  if (!serviceId) {
    showToast('Please select a salon service.', 'warning');
    return;
  }
  if (!bookingDate) {
    showToast('Please choose an appointment date.', 'warning');
    return;
  }
  if (!timeSlot) {
    showToast('Please choose an available time slot.', 'warning');
    return;
  }

  const submitBtn = document.getElementById('submitBookingBtn');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Securing Reservation...';

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: parseInt(serviceId, 10),
        booking_date: bookingDate,
        time_slot: timeSlot,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        stylist,
        notes
      })
    });

    const data = await res.json();

    if (!data.success) {
      if (data.is_fully_booked) {
        displayFullyBookedAlert(timeSlot);
      }
      showToast(data.message || 'Unable to book appointment.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      return;
    }

    // Success! Show digital pass modal
    showToast('Appointment successfully confirmed!', 'success');
    showBookingSuccessModal(data.booking);

    // Refresh slots
    fetchSlotAvailability();

  } catch (err) {
    console.error('Booking submission error:', err);
    showToast('Network error while booking appointment.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}

function showBookingSuccessModal(booking) {
  const modal = document.getElementById('bookingSuccessModal');
  if (!modal) return;

  document.getElementById('passBookingId').innerText = booking.booking_id;
  document.getElementById('passServiceName').innerText = booking.service_name;
  document.getElementById('passPrice').innerText = `₹${booking.service_price.toLocaleString('en-IN')}`;
  document.getElementById('passDate').innerText = booking.booking_date;
  document.getElementById('passTimeSlot').innerText = booking.time_slot;
  document.getElementById('passCustomerName').innerText = booking.customer_name;
  document.getElementById('passStylist').innerText = booking.stylist || 'Any Available Stylist';

  modal.classList.add('active');
}

function closeSuccessModal() {
  const modal = document.getElementById('bookingSuccessModal');
  if (modal) modal.classList.remove('active');
}

// -------------------------------------------------------------
// CANCEL APPOINTMENT FLOW
// -------------------------------------------------------------

function toggleCancelSearchType(type) {
  const idGroup = document.getElementById('lookupIdGroup');
  const phoneGroup = document.getElementById('lookupPhoneGroup');
  const btnId = document.getElementById('searchByBookingIdBtn');
  const btnPhone = document.getElementById('searchByPhoneBtn');

  if (type === 'id') {
    idGroup.style.display = 'block';
    phoneGroup.style.display = 'none';
    btnId.classList.add('active', 'btn-outline-gold');
    btnId.classList.remove('btn-secondary');
    btnPhone.classList.remove('active', 'btn-outline-gold');
    btnPhone.classList.add('btn-secondary');
  } else {
    idGroup.style.display = 'none';
    phoneGroup.style.display = 'block';
    btnPhone.classList.add('active', 'btn-outline-gold');
    btnPhone.classList.remove('btn-secondary');
    btnId.classList.remove('active', 'btn-outline-gold');
    btnId.classList.add('btn-secondary');
  }
}

async function handleCancelLookup(e) {
  e.preventDefault();

  const idVal = document.getElementById('lookupBookingId').value.trim();
  const phoneVal = document.getElementById('lookupPhone').value.trim();

  let queryUrl = '';
  if (document.getElementById('lookupIdGroup').style.display !== 'none') {
    if (!idVal) {
      showToast('Please enter your unique Booking ID.', 'warning');
      return;
    }
    queryUrl = `/api/bookings/lookup?booking_id=${encodeURIComponent(idVal)}`;
  } else {
    if (!phoneVal) {
      showToast('Please enter your registered phone number.', 'warning');
      return;
    }
    queryUrl = `/api/bookings/lookup?phone=${encodeURIComponent(phoneVal)}`;
  }

  try {
    const res = await fetch(queryUrl);
    const data = await res.json();

    if (!data.success || !data.bookings || data.bookings.length === 0) {
      showToast(data.message || 'No appointment found matching your query.', 'error');
      return;
    }

    state.cancelSearchResults = data.bookings;
    renderCancelBookingsReview(data.bookings);

  } catch (err) {
    console.error('Cancel lookup error:', err);
    showToast('Failed to retrieve appointment details.', 'error');
  }
}

function renderCancelBookingsReview(bookings) {
  const searchStep = document.getElementById('cancelSearchStep');
  const confirmStep = document.getElementById('cancelConfirmStep');
  const container = document.getElementById('cancelBookingsListContainer');

  searchStep.style.display = 'none';
  confirmStep.style.display = 'block';

  container.innerHTML = bookings.map(b => {
    const isCancelled = b.status === 'cancelled' || b.status === 'rejected';
    const isCompleted = b.status === 'completed';
    const canCancel = !isCancelled && !isCompleted;

    let badgeClass = 'badge-success';
    if (isCancelled) badgeClass = 'badge-danger';
    if (isCompleted) badgeClass = 'badge-info';

    return `
      <div style="background: var(--bg-primary); border: 1px solid var(--gold-border); border-radius: var(--radius-md); padding: 1.8rem; margin-bottom: 1.2rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <div>
            <span class="badge badge-gold" style="font-family: monospace; font-size: 0.9rem;">${b.booking_id}</span>
            <h4 class="font-serif" style="font-size: 1.3rem; margin: 0.4rem 0 0.2rem; color: #fff;">${b.service_name}</h4>
            <span style="font-size: 0.85rem; color: var(--gold-light);">Stylist: ${b.stylist || 'Any Available'}</span>
          </div>
          <span class="badge ${badgeClass}">${b.status.toUpperCase()}</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; border-top: 1px solid rgba(255,255,255,0.08); border-bottom: 1px solid rgba(255,255,255,0.08); padding: 1rem 0; margin-bottom: 1.2rem; font-size: 0.88rem;">
          <div>
            <span style="color: var(--text-dim); display: block;">Customer</span>
            <strong>${b.customer_name}</strong>
          </div>
          <div>
            <span style="color: var(--text-dim); display: block;">Phone</span>
            <strong>${b.customer_phone}</strong>
          </div>
          <div>
            <span style="color: var(--text-dim); display: block;">Date</span>
            <strong>${b.booking_date}</strong>
          </div>
          <div>
            <span style="color: var(--text-dim); display: block;">Time Slot</span>
            <strong class="text-gold">${b.time_slot}</strong>
          </div>
          <div>
            <span style="color: var(--text-dim); display: block;">Price</span>
            <strong class="text-gold">₹${b.service_price.toLocaleString('en-IN')}</strong>
          </div>
        </div>

        ${canCancel ? `
          <div style="margin-bottom: 1rem;">
            <label class="form-label" style="font-size: 0.85rem;">Reason for cancellation (Optional)</label>
            <select id="cancelReasonSelect_${b.id}" class="form-control" style="font-size: 0.88rem; margin-bottom: 0.5rem;">
              <option value="Scheduling Conflict">Scheduling Conflict</option>
              <option value="Illness or Emergency">Illness or Emergency</option>
              <option value="Travel / Out of Town">Travel / Out of Town</option>
              <option value="Need to Reschedule for Another Day">Need to Reschedule for Another Day</option>
              <option value="Other">Other Reason</option>
            </select>
          </div>
          <button class="btn btn-danger" style="width: 100%;" onclick="confirmCancelAppointment('${b.booking_id}', ${b.id})">
            <i class="fa-solid fa-ban"></i> Confirm Appointment Cancellation
          </button>
        ` : `
          <div style="background: rgba(255,255,255,0.04); padding: 0.8rem; border-radius: var(--radius-sm); font-size: 0.85rem; color: var(--text-muted);">
            ${isCancelled ? `<i class="fa-solid fa-circle-xmark text-danger"></i> Cancelled: "${b.cancel_reason || 'Customer request'}"` : '<i class="fa-solid fa-circle-check text-info"></i> Past completed appointments cannot be cancelled.'}
          </div>
        `}
      </div>
    `;
  }).join('');
}

async function confirmCancelAppointment(bookingId, recordId) {
  if (!confirm(`Are you certain you wish to cancel reservation ${bookingId}? This will immediately release your time slot.`)) {
    return;
  }

  const reasonEl = document.getElementById(`cancelReasonSelect_${recordId}`);
  const cancelReason = reasonEl ? reasonEl.value : 'Customer cancelled online';

  try {
    const res = await fetch('/api/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId, cancel_reason: cancelReason })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Failed to cancel appointment.', 'error');
      return;
    }

    showToast('Your appointment has been cancelled and your slot released.', 'success');
    
    // Refresh cancel list
    const updated = state.cancelSearchResults.map(b => b.booking_id === bookingId ? data.booking : b);
    renderCancelBookingsReview(updated);

    // Also refresh user appointments if loaded
    if (state.currentUser) {
      loadMyAppointments();
    }

  } catch (err) {
    console.error('Cancellation error:', err);
    showToast('Network error while cancelling appointment.', 'error');
  }
}

function resetCancelView() {
  document.getElementById('cancelSearchStep').style.display = 'block';
  document.getElementById('cancelConfirmStep').style.display = 'none';
}

// -------------------------------------------------------------
// MY APPOINTMENTS VIEW (LOGGED-IN USERS)
// -------------------------------------------------------------

async function loadMyAppointments() {
  const guestPrompt = document.getElementById('myAppointmentsGuestPrompt');
  const userContent = document.getElementById('myAppointmentsUserContent');

  if (!state.currentUser) {
    if (guestPrompt) guestPrompt.style.display = 'block';
    if (userContent) userContent.style.display = 'none';
    return;
  }

  if (guestPrompt) guestPrompt.style.display = 'none';
  if (userContent) userContent.style.display = 'block';

  try {
    const res = await fetch('/api/my-appointments');
    const data = await res.json();

    if (!data.success) {
      if (res.status === 401) {
        state.currentUser = null;
        updateUserNavUi();
        guestPrompt.style.display = 'block';
        userContent.style.display = 'none';
      }
      return;
    }

    state.userAppointments = data;

    // Counts
    document.getElementById('countAllAppointments').innerText = data.all.length;
    document.getElementById('countUpcomingAppointments').innerText = data.upcoming.length;
    document.getElementById('countCompletedAppointments').innerText = data.completed.length;
    document.getElementById('countCancelledAppointments').innerText = data.cancelled.length;

    // Render initial (all)
    renderAppointmentsList(data.all);

  } catch (err) {
    console.error('Error loading my appointments:', err);
  }
}

function switchAppointmentTab(tab, btnEl) {
  document.querySelectorAll('.app-tab-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  if (!state.userAppointments) return;

  if (tab === 'all') renderAppointmentsList(state.userAppointments.all);
  else if (tab === 'upcoming') renderAppointmentsList(state.userAppointments.upcoming);
  else if (tab === 'completed') renderAppointmentsList(state.userAppointments.completed);
  else if (tab === 'cancelled') renderAppointmentsList(state.userAppointments.cancelled);
}

function renderAppointmentsList(list) {
  const container = document.getElementById('appointmentsListContainer');
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; background: var(--bg-card); border-radius: var(--radius-lg); padding: 3.5rem 1rem; border: 1px solid rgba(255,255,255,0.06);">
        <i class="fa-regular fa-calendar-xmark" style="font-size: 2.5rem; color: var(--gold-border); margin-bottom: 1rem;"></i>
        <h4 class="font-serif" style="font-size: 1.4rem; color: #fff;">No Appointments In This Category</h4>
        <p style="color: var(--text-dim); margin-top: 0.5rem;">Explore our luxury menu and book your next rejuvenation session.</p>
        <button class="btn btn-primary btn-sm" onclick="navigateTo('booking')" style="margin-top: 1rem;">
          <i class="fa-regular fa-calendar-check"></i> Book Now
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(a => {
    const isUpcoming = a.status === 'confirmed' && a.booking_date >= new Date().toISOString().slice(0, 10);
    const isCancelled = a.status === 'cancelled' || a.status === 'rejected';
    const isCompleted = a.status === 'completed' || (a.status === 'confirmed' && a.booking_date < new Date().toISOString().slice(0, 10));

    let badgeClass = 'badge-success';
    let statusLabel = 'CONFIRMED';
    if (isCancelled) {
      badgeClass = 'badge-danger';
      statusLabel = 'CANCELLED';
    } else if (isCompleted) {
      badgeClass = 'badge-info';
      statusLabel = 'COMPLETED';
    }

    const [year, month, day] = a.booking_date.split('-');
    const dateObj = new Date(year, month - 1, day);
    const monthShort = dateObj.toLocaleString('en-US', { month: 'short' });

    return `
      <div class="appointment-item-card">
        <div class="app-main-info">
          <div class="app-date-box">
            <span class="app-date-month">${monthShort}</span>
            <span class="app-date-day">${day}</span>
            <span class="app-date-time">${a.time_slot}</span>
          </div>
          <div>
            <span class="badge badge-gold" style="font-family: monospace; margin-bottom: 0.4rem;">${a.booking_id}</span>
            <h3 class="font-serif" style="font-size: 1.35rem; color: #fff; margin-bottom: 0.2rem;">${a.service_name}</h3>
            <p style="margin: 0; font-size: 0.88rem; color: var(--gold-light);">Stylist: ${a.stylist || 'Any Available'}</p>
            <p style="margin: 0.2rem 0 0; font-size: 0.82rem; color: var(--text-dim);">Reserved for: ${a.customer_name} (${a.customer_phone})</p>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;">
          <div style="text-align: right;">
            <span class="badge ${badgeClass}" style="margin-bottom: 0.3rem;">${statusLabel}</span>
            <div class="text-gold font-serif" style="font-size: 1.35rem; font-weight: 700;">₹${a.service_price.toLocaleString('en-IN')}</div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            <button class="btn btn-secondary btn-sm" onclick='showBookingSuccessModal(${JSON.stringify(a).replace(/'/g, "&#39;")})'>
              <i class="fa-solid fa-receipt"></i> View Pass
            </button>
            ${isUpcoming ? `
              <button class="btn btn-outline-danger btn-sm" onclick="cancelFromMyAppointments('${a.booking_id}')">
                <i class="fa-solid fa-xmark"></i> Cancel
              </button>
            ` : `
              <button class="btn btn-outline-gold btn-sm" onclick="bookThisSpecificService(${a.service_id})">
                <i class="fa-solid fa-rotate-right"></i> Rebook
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function cancelFromMyAppointments(bookingId) {
  navigateTo('cancel');
  document.getElementById('lookupBookingId').value = bookingId;
  toggleCancelSearchType('id');
  document.getElementById('cancelSearchStep').querySelector('form').dispatchEvent(new Event('submit'));
}

// -------------------------------------------------------------
// CONTACT FORM SUBMISSION
// -------------------------------------------------------------

async function handleContactSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('contactName').value;
  const email = document.getElementById('contactEmail').value;
  const phone = document.getElementById('contactPhone').value;
  const subject = document.getElementById('contactSubject').value;
  const message = document.getElementById('contactMessage').value;

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, subject, message })
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      e.target.reset();
    } else {
      showToast(data.message || 'Error sending message.', 'error');
    }
  } catch (err) {
    console.error('Contact submit error:', err);
    showToast('Failed to deliver message. Please call our concierge.', 'error');
  }
}

// -------------------------------------------------------------
// USER AUTHENTICATION (CLIENT)
// -------------------------------------------------------------

async function checkCurrentUser() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.success && data.user) {
      state.currentUser = data.user;
    } else {
      state.currentUser = null;
    }
  } catch (e) {
    state.currentUser = null;
  }
  updateUserNavUi();
}

function updateUserNavUi() {
  const guestNav = document.getElementById('authNavGuest');
  const userNav = document.getElementById('authNavUser');
  const avatar = document.getElementById('navUserAvatar');
  const nameEl = document.getElementById('navUserName');
  const emailEl = document.getElementById('dropdownUserEmail');
  const roleEl = document.getElementById('dropdownUserRole');
  const adminLink = document.getElementById('adminPortalLinkContainer');

  // Autofill booking inputs if user is logged in
  const bookName = document.getElementById('bookingCustomerName');
  const bookEmail = document.getElementById('bookingCustomerEmail');
  const bookPhone = document.getElementById('bookingCustomerPhone');

  if (state.currentUser) {
    if (guestNav) guestNav.style.display = 'none';
    if (userNav) userNav.style.display = 'flex';

    if (avatar) avatar.innerText = state.currentUser.name.charAt(0).toUpperCase();
    if (nameEl) nameEl.innerText = state.currentUser.name.split(' ')[0];
    if (emailEl) emailEl.innerText = state.currentUser.email;
    if (roleEl) roleEl.innerText = state.currentUser.role === 'admin' ? 'Administrator' : 'Valued Client';

    if (adminLink) {
      adminLink.style.display = state.currentUser.role === 'admin' ? 'block' : 'none';
    }

    if (bookName && !bookName.value) bookName.value = state.currentUser.name;
    if (bookEmail && !bookEmail.value) bookEmail.value = state.currentUser.email;
    if (bookPhone && !bookPhone.value) bookPhone.value = state.currentUser.phone;
  } else {
    if (guestNav) guestNav.style.display = 'flex';
    if (userNav) userNav.style.display = 'none';
  }
}

function toggleUserDropdown() {
  const dropdown = document.getElementById('userDropdown');
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
  }
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const userNav = document.getElementById('authNavUser');
  const dropdown = document.getElementById('userDropdown');
  if (dropdown && userNav && !userNav.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

function openAuthModal(tab = 'login') {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.add('active');
    switchAuthTab(tab);
  }
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('active');
}

function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginTab = document.getElementById('authTabLogin');
  const regTab = document.getElementById('authTabRegister');

  if (tab === 'login') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    loginTab.classList.add('active');
    regTab.classList.remove('active');
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    regTab.classList.add('active');
    loginTab.classList.remove('active');
  }
}

// Quick autofill for easy evaluation
function quickFillCustomerLogin() {
  document.getElementById('loginEmail').value = 'priya.sharma@example.com';
  document.getElementById('loginPassword').value = 'password123';
}

function quickFillAdminLogin() {
  document.getElementById('loginEmail').value = 'admin@luxesalon.com';
  document.getElementById('loginPassword').value = 'admin123';
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Login failed.', 'error');
      return;
    }

    state.currentUser = data.user;
    updateUserNavUi();
    closeAuthModal();
    showToast(data.message, 'success');

    // Role-based redirection
    if (data.user.role === 'admin') {
      openAdminPanel();
    } else {
      navigateTo('home');
    }

  } catch (err) {
    console.error('Login error:', err);
    showToast('Network error during login.', 'error');
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const phone = document.getElementById('regPhone').value;
  const password = document.getElementById('regPassword').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Registration failed.', 'error');
      return;
    }

    state.currentUser = data.user;
    updateUserNavUi();
    closeAuthModal();
    showToast(data.message, 'success');
    navigateTo('home');

  } catch (err) {
    console.error('Registration error:', err);
    showToast('Network error during registration.', 'error');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    // Ignore error
  }
  state.currentUser = null;
  updateUserNavUi();
  showToast('You have been signed out.', 'gold');

  // If inside admin app, return to website
  closeAdminPanel();
  navigateTo('home');
}

