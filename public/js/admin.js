/**
 * LUMIÈRE LUXURY SALON & SPA - ADMIN PORTAL FRONTEND LOGIC (admin.js)
 */

const adminState = {
  currentView: 'dashboard',
  bookings: [],
  services: [],
  customers: [],
  slotsData: null,
  trendChart: null,
  statusChart: null
};

// -------------------------------------------------------------
// ADMIN PANEL ACCESS & AUTHENTICATION
// -------------------------------------------------------------

async function openAdminPanel() {
  const customerApp = document.getElementById('customerApp');
  const adminApp = document.getElementById('adminApp');
  const loginScreen = document.getElementById('adminLoginScreen');
  const mainLayout = document.getElementById('adminMainLayout');

  customerApp.style.display = 'none';
  adminApp.style.display = 'block';

  // Set live date in topbar
  const liveDateEl = document.getElementById('adminLiveDate');
  if (liveDateEl) {
    liveDateEl.innerText = new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  // Check if current user is an admin
  if (state.currentUser && state.currentUser.role === 'admin') {
    loginScreen.style.display = 'none';
    mainLayout.style.display = 'flex';
    document.getElementById('adminLoggedName').innerText = state.currentUser.name;
    loadAdminDashboard();
  } else {
    loginScreen.style.display = 'flex';
    mainLayout.style.display = 'none';
  }
}

function closeAdminPanel() {
  const customerApp = document.getElementById('customerApp');
  const adminApp = document.getElementById('adminApp');

  adminApp.style.display = 'none';
  customerApp.style.display = 'block';
  navigateTo('home');
}

async function handleAdminLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('adminEmailInput').value;
  const password = document.getElementById('adminPasswordInput').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Admin authentication failed.', 'error');
      return;
    }

    if (data.user.role !== 'admin') {
      showToast('Access denied. Administrator privileges required.', 'error');
      return;
    }

    state.currentUser = data.user;
    updateUserNavUi();

    document.getElementById('adminLoginScreen').style.display = 'none';
    document.getElementById('adminMainLayout').style.display = 'flex';
    document.getElementById('adminLoggedName').innerText = data.user.name;

    showToast(`Welcome to Administration, ${data.user.name}`, 'success');
    loadAdminDashboard();

  } catch (err) {
    console.error('Admin login error:', err);
    showToast('Network error during admin login.', 'error');
  }
}

// -------------------------------------------------------------
// ADMIN VIEW SWITCHER
// -------------------------------------------------------------

function switchAdminView(viewId) {
  adminState.currentView = viewId;

  // Update sidebar active item
  document.querySelectorAll('.admin-nav-item').forEach(item => {
    if (item.dataset.adminView === viewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Switch subview div
  document.querySelectorAll('.admin-subview').forEach(view => {
    view.style.display = 'none';
  });

  const target = document.getElementById(`admin-view-${viewId}`);
  if (target) target.style.display = 'block';

  // Update topbar title
  const titles = {
    dashboard: 'Operational Dashboard',
    bookings: 'Appointment Bookings Management',
    services: 'Salon Services Catalog',
    slots: 'Time Slot & Capacity Management',
    customers: 'Registered Customer Accounts',
    shop: 'Salon Shop Configuration',
    reports: 'Reports & Business Analytics'
  };
  document.getElementById('adminCurrentViewTitle').innerText = titles[viewId] || 'Admin Portal';

  // Load view-specific data
  if (viewId === 'dashboard') loadAdminDashboard();
  else if (viewId === 'bookings') loadAdminBookings();
  else if (viewId === 'services') loadAdminServices();
  else if (viewId === 'slots') loadAdminSlots();
  else if (viewId === 'customers') loadAdminCustomers();
  else if (viewId === 'shop') loadAdminShopSettings();
  else if (viewId === 'reports') loadAdminReports();
}

// -------------------------------------------------------------
// 1. DASHBOARD
// -------------------------------------------------------------

async function loadAdminDashboard() {
  try {
    const res = await fetch('/api/admin/dashboard');
    if (res.status === 401 || res.status === 403) {
      openAdminPanel();
      return;
    }
    const data = await res.json();
    if (!data.success) return;

    const s = data.stats;
    document.getElementById('dashTotalBookings').innerText = s.totalBookings;
    document.getElementById('dashTodayBookings').innerText = s.todayBookings;
    document.getElementById('dashPendingBookings').innerText = s.pendingBookings;
    document.getElementById('dashCompletedBookings').innerText = s.completedBookings;
    document.getElementById('dashCancelledBookings').innerText = s.cancelledBookings;
    document.getElementById('dashTotalRevenue').innerText = `₹${s.totalRevenue.toLocaleString('en-IN')}`;

    // Render today's appointments table
    renderDashTodaySchedule(data.todayAppointments);

    // Render recent activity stream
    renderDashRecentActivity(data.recentActivity);

  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function renderDashTodaySchedule(appointments) {
  const container = document.getElementById('dashTodayAppointmentsContainer');
  if (!container) return;

  if (!appointments || appointments.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        <i class="fa-solid fa-mug-saucer" style="font-size: 1.8rem; margin-bottom: 0.5rem; color: var(--gold-border);"></i>
        <p style="margin: 0;">No appointments scheduled for today yet.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Customer</th>
          <th>Service</th>
          <th>Stylist</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${appointments.map(a => `
          <tr>
            <td style="font-weight: 700; color: var(--gold-light);">${a.time_slot}</td>
            <td>
              <strong>${a.customer_name}</strong><br>
              <small style="color: var(--text-dim);">${a.customer_phone}</small>
            </td>
            <td>${a.service_name}</td>
            <td><small>${a.stylist || 'Any Available'}</small></td>
            <td>${getStatusBadgeHtml(a.status)}</td>
            <td>
              <div style="display: flex; gap: 0.3rem;">
                ${a.status !== 'completed' ? `
                  <button class="btn btn-secondary btn-sm" title="Mark Completed" onclick="updateBookingStatus(${a.id}, 'completed')">
                    <i class="fa-solid fa-check text-success"></i>
                  </button>
                ` : ''}
                ${a.status !== 'cancelled' ? `
                  <button class="btn btn-secondary btn-sm" title="Cancel Appointment" onclick="updateBookingStatus(${a.id}, 'cancelled')">
                    <i class="fa-solid fa-ban text-danger"></i>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderDashRecentActivity(list) {
  const container = document.getElementById('dashRecentActivityContainer');
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = '<p style="color: var(--text-dim); font-size: 0.85rem;">No recent bookings recorded.</p>';
    return;
  }

  container.innerHTML = list.map(item => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: var(--bg-primary); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05); font-size: 0.85rem;">
      <div>
        <strong style="color: #fff;">${item.customer_name}</strong>
        <p style="margin: 0; color: var(--text-dim); font-size: 0.78rem;">${item.service_name} • ${item.booking_date} at ${item.time_slot}</p>
      </div>
      <div>
        ${getStatusBadgeHtml(item.status)}
      </div>
    </div>
  `).join('');
}

function getStatusBadgeHtml(status) {
  const s = (status || '').toLowerCase();
  if (s === 'confirmed') return '<span class="badge badge-success">Confirmed</span>';
  if (s === 'completed') return '<span class="badge badge-info">Completed</span>';
  if (s === 'cancelled' || s === 'rejected') return '<span class="badge badge-danger">Cancelled</span>';
  return `<span class="badge badge-warning">${status}</span>`;
}

// -------------------------------------------------------------
// 2. MANAGE BOOKINGS
// -------------------------------------------------------------

async function loadAdminBookings() {
  const search = document.getElementById('adminBookingSearch')?.value || '';
  const status = document.getElementById('adminBookingStatusFilter')?.value || 'all';
  const date = document.getElementById('adminBookingDateFilter')?.value || '';

  try {
    let url = `/api/admin/bookings?status=${encodeURIComponent(status)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (date) url += `&date=${encodeURIComponent(date)}`;

    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) return;

    adminState.bookings = data.bookings;
    renderAdminBookingsTable(data.bookings);

  } catch (err) {
    console.error('Error loading admin bookings:', err);
  }
}

function renderAdminBookingsTable(bookings) {
  const tbody = document.getElementById('adminBookingsTableBody');
  if (!tbody) return;

  if (!bookings || bookings.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          No appointments found matching your filter criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = bookings.map(b => `
    <tr>
      <td><span class="badge badge-gold" style="font-family: monospace;">${b.booking_id}</span></td>
      <td>
        <strong>${b.customer_name}</strong><br>
        <small style="color: var(--text-dim);">${b.customer_email || 'No email'}</small>
      </td>
      <td>${b.customer_phone}</td>
      <td>
        <strong>${b.service_name}</strong>
        ${b.notes ? `<br><small style="color: var(--warning);"><i class="fa-regular fa-comment-dots"></i> ${b.notes}</small>` : ''}
      </td>
      <td>
        <span style="display: block; font-weight: 600;">${b.booking_date}</span>
        <span style="color: var(--gold-light); font-size: 0.85rem;">${b.time_slot}</span>
      </td>
      <td><small>${b.stylist || 'Any Available'}</small></td>
      <td style="font-weight: 700; color: var(--gold-light);">₹${b.service_price.toLocaleString('en-IN')}</td>
      <td>${getStatusBadgeHtml(b.status)}</td>
      <td>
        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
          ${b.status !== 'confirmed' && b.status !== 'completed' ? `
            <button class="btn btn-secondary btn-sm" title="Confirm Booking" onclick="updateBookingStatus(${b.id}, 'confirmed')">
              <i class="fa-solid fa-check text-success"></i>
            </button>
          ` : ''}
          ${b.status !== 'completed' && b.status !== 'cancelled' ? `
            <button class="btn btn-secondary btn-sm" title="Mark Completed" onclick="updateBookingStatus(${b.id}, 'completed')">
              <i class="fa-solid fa-award text-info"></i>
            </button>
          ` : ''}
          ${b.status !== 'cancelled' ? `
            <button class="btn btn-secondary btn-sm" title="Reschedule" onclick='openRescheduleModal(${JSON.stringify(b).replace(/'/g, "&#39;")})'>
              <i class="fa-regular fa-calendar-days text-gold"></i>
            </button>
            <button class="btn btn-secondary btn-sm" title="Cancel Booking" onclick="updateBookingStatus(${b.id}, 'cancelled')">
              <i class="fa-solid fa-ban text-danger"></i>
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

function resetAdminBookingFilters() {
  document.getElementById('adminBookingSearch').value = '';
  document.getElementById('adminBookingStatusFilter').value = 'all';
  document.getElementById('adminBookingDateFilter').value = '';
  loadAdminBookings();
}

async function updateBookingStatus(bookingDbId, newStatus) {
  let cancelReason = null;
  if (newStatus === 'cancelled') {
    cancelReason = prompt('Reason for cancelling this appointment (optional):', 'Administrative cancellation');
    if (cancelReason === null) return; // user cancelled prompt
  }

  try {
    const res = await fetch(`/api/admin/bookings/${bookingDbId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, cancel_reason: cancelReason })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Failed to update status.', 'error');
      return;
    }

    showToast(data.message, 'success');
    loadAdminBookings();
    loadAdminDashboard();

  } catch (err) {
    console.error('Update status error:', err);
    showToast('Network error while updating status.', 'error');
  }
}

// Reschedule Booking Flow
function openRescheduleModal(booking) {
  const modal = document.getElementById('rescheduleBookingModal');
  if (!modal) return;

  document.getElementById('rescheduleBookingDbId').value = booking.id;
  document.getElementById('rescheduleModalDesc').innerText = `Rescheduling booking ${booking.booking_id} for ${booking.customer_name} (${booking.service_name}). Current: ${booking.booking_date} at ${booking.time_slot}.`;

  const dateInput = document.getElementById('rescheduleDateInput');
  dateInput.min = new Date().toISOString().slice(0, 10);
  dateInput.value = booking.booking_date;

  modal.classList.add('active');
}

function closeRescheduleModal() {
  const modal = document.getElementById('rescheduleBookingModal');
  if (modal) modal.classList.remove('active');
}

async function fetchRescheduleSlots() {
  const dateVal = document.getElementById('rescheduleDateInput').value;
  if (!dateVal) return;

  try {
    const res = await fetch(`/api/slots/availability?date=${dateVal}`);
    const data = await res.json();
    if (data.success && data.slots) {
      const select = document.getElementById('rescheduleTimeSelect');
      select.innerHTML = '<option value="">-- Choose Slot --</option>' + 
        data.slots.map(s => `
          <option value="${s.time_slot}" ${!s.is_available ? 'disabled' : ''}>
            ${s.time_slot} ${s.status === 'fully_booked' ? '(Fully Booked)' : `(${s.remaining_slots} left)`}
          </option>
        `).join('');
    }
  } catch (e) {
    console.error(e);
  }
}

async function handleRescheduleSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('rescheduleBookingDbId').value;
  const newDate = document.getElementById('rescheduleDateInput').value;
  const newSlot = document.getElementById('rescheduleTimeSelect').value;

  if (!newDate || !newSlot) {
    showToast('Please select a valid date and time slot.', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/admin/bookings/${id}/reschedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_date: newDate, new_time_slot: newSlot })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Reschedule failed.', 'error');
      return;
    }

    showToast(data.message, 'success');
    closeRescheduleModal();
    loadAdminBookings();

  } catch (err) {
    console.error('Reschedule error:', err);
    showToast('Network error during reschedule.', 'error');
  }
}

// -------------------------------------------------------------
// 3. MANAGE SERVICES
// -------------------------------------------------------------

async function loadAdminServices() {
  try {
    const res = await fetch('/api/admin/services');
    const data = await res.json();
    if (!data.success) return;

    adminState.services = data.services;
    renderAdminServicesTable(data.services);

  } catch (err) {
    console.error('Error loading admin services:', err);
  }
}

function renderAdminServicesTable(services) {
  const tbody = document.getElementById('adminServicesTableBody');
  if (!tbody) return;

  tbody.innerHTML = services.map(s => `
    <tr>
      <td>
        <img src="${s.image_url}" alt="${s.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--gold-border);">
      </td>
      <td>
        <strong>${s.name}</strong>
        <p style="margin: 0; font-size: 0.8rem; color: var(--text-dim); max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.description}</p>
      </td>
      <td><span class="badge badge-gold">${s.category}</span></td>
      <td style="font-weight: 700; color: var(--gold-light);">₹${s.price.toLocaleString('en-IN')}</td>
      <td>${s.duration} mins</td>
      <td>
        ${s.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}
      </td>
      <td>
        <div style="display: flex; gap: 0.4rem;">
          <button class="btn btn-secondary btn-sm" title="Edit Service" onclick='openServiceModal("edit", ${JSON.stringify(s).replace(/'/g, "&#39;")})'>
            <i class="fa-regular fa-pen-to-square text-gold"></i>
          </button>
          <button class="btn btn-outline-danger btn-sm" title="Delete Service" onclick="deleteService(${s.id}, '${s.name.replace(/'/g, "\\'")}')">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openServiceModal(mode = 'add', service = null) {
  const modal = document.getElementById('serviceEditModal');
  const title = document.getElementById('serviceModalTitle');

  if (mode === 'add') {
    title.innerText = 'Add New Salon Service';
    document.getElementById('serviceFormId').value = '';
    document.getElementById('serviceFormName').value = '';
    document.getElementById('serviceFormCategory').value = 'Hair Styling & Cut';
    document.getElementById('serviceFormPrice').value = '499';
    document.getElementById('serviceFormDuration').value = '45';
    document.getElementById('serviceFormImage').value = '';
    document.getElementById('serviceFormDescription').value = '';
    document.getElementById('serviceFormIsActive').checked = true;
  } else {
    title.innerText = 'Edit Salon Service';
    document.getElementById('serviceFormId').value = service.id;
    document.getElementById('serviceFormName').value = service.name;
    document.getElementById('serviceFormCategory').value = service.category;
    document.getElementById('serviceFormPrice').value = service.price;
    document.getElementById('serviceFormDuration').value = service.duration;
    document.getElementById('serviceFormImage').value = service.image_url;
    document.getElementById('serviceFormDescription').value = service.description;
    document.getElementById('serviceFormIsActive').checked = !!service.is_active;
  }

  modal.classList.add('active');
}

function closeServiceModal() {
  const modal = document.getElementById('serviceEditModal');
  if (modal) modal.classList.remove('active');
}

async function handleServiceFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('serviceFormId').value;
  const name = document.getElementById('serviceFormName').value;
  const category = document.getElementById('serviceFormCategory').value;
  const price = document.getElementById('serviceFormPrice').value;
  const duration = document.getElementById('serviceFormDuration').value;
  const image_url = document.getElementById('serviceFormImage').value;
  const description = document.getElementById('serviceFormDescription').value;
  const is_active = document.getElementById('serviceFormIsActive').checked;

  const payload = {
    name,
    category,
    price: parseFloat(price),
    duration: parseInt(duration, 10),
    image_url,
    description,
    is_active
  };

  const isEdit = !!id;
  const url = isEdit ? `/api/admin/services/${id}` : '/api/admin/services';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Operation failed.', 'error');
      return;
    }

    showToast(data.message, 'success');
    closeServiceModal();
    loadAdminServices();

    // Also reload services in client catalog
    loadServices();

  } catch (err) {
    console.error('Service form error:', err);
    showToast('Network error while saving service.', 'error');
  }
}

async function deleteService(serviceId, serviceName) {
  if (!confirm(`Are you sure you want to delete service "${serviceName}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/services/${serviceId}`, { method: 'DELETE' });
    const data = await res.json();

    if (!data.success) {
      showToast(data.message || 'Delete failed.', 'error');
      return;
    }

    showToast(data.message, 'success');
    loadAdminServices();
    loadServices();

  } catch (err) {
    console.error('Delete error:', err);
    showToast('Network error while deleting service.', 'error');
  }
}

// -------------------------------------------------------------
// 4. SLOT & CAPACITY MANAGEMENT
// -------------------------------------------------------------

async function loadAdminSlots() {
  const datePicker = document.getElementById('adminSlotDateInspector');
  if (!datePicker.value) {
    datePicker.value = new Date().toISOString().slice(0, 10);
  }
  const dateVal = datePicker.value;

  try {
    const res = await fetch(`/api/admin/slots?date=${dateVal}`);
    const data = await res.json();
    if (!data.success) return;

    adminState.slotsData = data;
    document.getElementById('adminMaxCapacityInput').value = data.max_capacity;

    renderAdminSlotsInspector(data.slots);
    renderAdminBlockedList(data.blocked_slots);

  } catch (err) {
    console.error('Error loading admin slots:', err);
  }
}

function renderAdminSlotsInspector(slots) {
  const container = document.getElementById('adminSlotsInspectorGrid');
  if (!container) return;

  container.innerHTML = slots.map(s => {
    let badgeClass = 'badge-success';
    let statusText = `${s.available_slots} available`;
    if (s.is_full) {
      badgeClass = 'badge-danger';
      statusText = 'Fully Booked';
    }

    return `
      <div style="background: var(--bg-primary); border: 1px solid ${s.is_full ? 'var(--danger)' : 'rgba(255,255,255,0.08)'}; border-radius: var(--radius-md); padding: 1rem; text-align: center;">
        <strong style="font-size: 1rem; color: #fff; display: block; margin-bottom: 0.3rem;">${s.time_slot}</strong>
        <span class="badge ${badgeClass}" style="margin-bottom: 0.5rem;">${statusText}</span>
        <div style="font-size: 0.78rem; color: var(--text-dim);">
          Bookings: <strong>${s.booked_count}</strong> / ${s.max_capacity}
        </div>
      </div>
    `;
  }).join('');
}

function renderAdminBlockedList(blocked) {
  const container = document.getElementById('adminBlockedListContainer');
  if (!container) return;

  if (!blocked || blocked.length === 0) {
    container.innerHTML = '<span style="color: var(--text-dim); font-size: 0.82rem;">No active slot or date closures.</span>';
    return;
  }

  container.innerHTML = blocked.map(b => `
    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--radius-sm); padding: 0.5rem 0.8rem; font-size: 0.82rem;">
      <div>
        <strong style="color: #f87171;">${b.date}</strong> ${b.time_slot ? `(${b.time_slot})` : '(Full Day)'}
        <span style="display: block; color: var(--text-muted); font-size: 0.75rem;">${b.reason || 'Closed'}</span>
      </div>
      <button class="btn btn-outline-danger btn-sm" onclick="unblockSlot(${b.id})" style="padding: 0.2rem 0.5rem;">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join('');
}

async function saveAdminSlotCapacity() {
  const capacity = document.getElementById('adminMaxCapacityInput').value;

  try {
    const res = await fetch('/api/admin/slots/capacity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_capacity: capacity })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Error updating capacity.', 'error');
      return;
    }

    showToast(data.message, 'success');
    loadAdminSlots();

  } catch (err) {
    console.error('Slot capacity error:', err);
    showToast('Failed to update capacity.', 'error');
  }
}

async function handleBlockSlotSubmit(e) {
  e.preventDefault();
  const date = document.getElementById('blockSlotDate').value;
  const time_slot = document.getElementById('blockSlotTime').value;
  const reason = document.getElementById('blockSlotReason').value;

  try {
    const res = await fetch('/api/admin/slots/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, time_slot, reason })
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Failed to block slot.', 'error');
      return;
    }

    showToast(data.message, 'success');
    e.target.reset();
    loadAdminSlots();

  } catch (err) {
    console.error('Block slot error:', err);
    showToast('Network error blocking slot.', 'error');
  }
}

async function unblockSlot(blockId) {
  try {
    const res = await fetch(`/api/admin/slots/block/${blockId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Block removed.', 'success');
      loadAdminSlots();
    }
  } catch (err) {
    console.error('Unblock error:', err);
  }
}

// -------------------------------------------------------------
// 5. CUSTOMER MANAGEMENT
// -------------------------------------------------------------

async function loadAdminCustomers() {
  const search = document.getElementById('adminCustomerSearch')?.value || '';

  try {
    let url = '/api/admin/customers';
    if (search) url += `?search=${encodeURIComponent(search)}`;

    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) return;

    adminState.customers = data.customers;
    renderAdminCustomersTable(data.customers);

  } catch (err) {
    console.error('Error loading customers:', err);
  }
}

function renderAdminCustomersTable(customers) {
  const tbody = document.getElementById('adminCustomersTableBody');
  if (!tbody) return;

  if (!customers || customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">No customers found.</td></tr>';
    return;
  }

  tbody.innerHTML = customers.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.email}</td>
      <td>${c.phone}</td>
      <td><small style="color: var(--text-dim);">${c.created_at ? c.created_at.slice(0, 10) : '--'}</small></td>
      <td><span class="badge badge-gold">${c.total_bookings}</span></td>
      <td style="font-weight: 700; color: var(--gold-light);">₹${c.total_spent.toLocaleString('en-IN')}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="viewCustomerHistory(${c.id}, '${c.name.replace(/'/g, "\\'")}')">
          <i class="fa-solid fa-clock-rotate-left"></i> View History
        </button>
      </td>
    </tr>
  `).join('');
}

async function viewCustomerHistory(customerId, customerName) {
  try {
    const res = await fetch(`/api/admin/customers/${customerId}/history`);
    const data = await res.json();
    if (!data.success) return;

    document.getElementById('customerHistoryName').innerText = `${customerName}'s Booking History`;
    document.getElementById('customerHistoryMeta').innerText = `${data.customer.email} • ${data.customer.phone} • Total ${data.history.length} appointments`;

    const container = document.getElementById('customerHistoryTableContainer');
    if (!data.history || data.history.length === 0) {
      container.innerHTML = '<p style="padding: 2rem; text-align: center; color: var(--text-muted);">No appointment records found for this customer.</p>';
    } else {
      container.innerHTML = `
        <table class="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Service</th>
              <th>Date &amp; Time</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.history.map(h => `
              <tr>
                <td><span class="badge badge-gold" style="font-family: monospace;">${h.booking_id}</span></td>
                <td><strong>${h.service_name}</strong></td>
                <td>${h.booking_date} at ${h.time_slot}</td>
                <td style="font-weight: 700; color: var(--gold-light);">₹${h.service_price.toLocaleString('en-IN')}</td>
                <td>${getStatusBadgeHtml(h.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    document.getElementById('customerHistoryModal').classList.add('active');

  } catch (err) {
    console.error('Customer history error:', err);
  }
}

function closeCustomerHistoryModal() {
  const modal = document.getElementById('customerHistoryModal');
  if (modal) modal.classList.remove('active');
}

// -------------------------------------------------------------
// 6. SHOP MANAGEMENT
// -------------------------------------------------------------

async function loadAdminShopSettings() {
  try {
    const res = await fetch('/api/admin/shop-settings');
    const data = await res.json();
    if (!data.success || !data.settings) return;

    const s = data.settings;
    document.getElementById('settingSalonName').value = s.salon_name || '';
    document.getElementById('settingTagline').value = s.tagline || '';
    document.getElementById('settingPhone').value = s.phone || '';
    document.getElementById('settingEmail').value = s.email || '';
    document.getElementById('settingAddress').value = s.address || '';
    document.getElementById('settingHoursMonFri').value = s.hours_mon_fri || '';
    document.getElementById('settingHoursSat').value = s.hours_sat || '';
    document.getElementById('settingHoursSun').value = s.hours_sun || '';
    document.getElementById('settingAboutStory').value = s.about_story || '';
    document.getElementById('settingFacilities').value = s.facilities || '';
    document.getElementById('settingHolidays').value = s.holidays || '';

  } catch (err) {
    console.error('Error loading shop settings:', err);
  }
}

async function handleShopSettingsSubmit(e) {
  e.preventDefault();

  const payload = {
    salon_name: document.getElementById('settingSalonName').value,
    tagline: document.getElementById('settingTagline').value,
    phone: document.getElementById('settingPhone').value,
    email: document.getElementById('settingEmail').value,
    address: document.getElementById('settingAddress').value,
    hours_mon_fri: document.getElementById('settingHoursMonFri').value,
    hours_sat: document.getElementById('settingHoursSat').value,
    hours_sun: document.getElementById('settingHoursSun').value,
    about_story: document.getElementById('settingAboutStory').value,
    facilities: document.getElementById('settingFacilities').value,
    holidays: document.getElementById('settingHolidays').value
  };

  try {
    const res = await fetch('/api/admin/shop-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) {
      showToast(data.message || 'Error updating settings.', 'error');
      return;
    }

    showToast(data.message, 'success');
    // Refresh client facing info
    renderShopSettings(data.settings);

  } catch (err) {
    console.error('Shop save error:', err);
    showToast('Network error while saving shop settings.', 'error');
  }
}

// -------------------------------------------------------------
// 7. REPORTS & ANALYTICS
// -------------------------------------------------------------

async function loadAdminReports() {
  try {
    const res = await fetch('/api/admin/reports');
    const data = await res.json();
    if (!data.success) return;

    renderTrendChart(data.bookingsTrend);
    renderStatusChart(data.statusBreakdown);
    renderTopServicesTable(data.topServices);

  } catch (err) {
    console.error('Error loading reports:', err);
  }
}

function renderTrendChart(trend) {
  const canvas = document.getElementById('reportsTrendChart');
  if (!canvas) return;

  if (adminState.trendChart) {
    adminState.trendChart.destroy();
  }

  const labels = trend.map(t => t.booking_date.slice(5)); // MM-DD
  const bookingsData = trend.map(t => t.total_bookings);
  const revenueData = trend.map(t => t.revenue);

  adminState.trendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Bookings Volume',
          data: bookingsData,
          borderColor: '#d4af37',
          backgroundColor: 'rgba(212, 175, 55, 0.15)',
          fill: true,
          tension: 0.35,
          yAxisID: 'y'
        },
        {
          label: 'Revenue (₹)',
          data: revenueData,
          borderColor: '#10b981',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.35,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af' }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#d4af37', stepSize: 1 }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { color: '#10b981' }
        }
      },
      plugins: {
        legend: {
          labels: { color: '#f3f4f6' }
        }
      }
    }
  });
}

function renderStatusChart(breakdown) {
  const canvas = document.getElementById('reportsStatusChart');
  if (!canvas) return;

  if (adminState.statusChart) {
    adminState.statusChart.destroy();
  }

  const labels = breakdown.map(b => b.status.toUpperCase());
  const counts = breakdown.map(b => b.count);

  const colors = {
    CONFIRMED: '#10b981',
    COMPLETED: '#3b82f6',
    CANCELLED: '#ef4444',
    REJECTED: '#f87171',
    PENDING: '#f59e0b'
  };

  const bgColors = labels.map(l => colors[l] || '#d4af37');

  adminState.statusChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: counts,
          backgroundColor: bgColors,
          borderColor: '#181c26',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#f3f4f6' }
        }
      }
    }
  });
}

function renderTopServicesTable(topServices) {
  const container = document.getElementById('adminTopServicesContainer');
  if (!container) return;

  if (!topServices || topServices.length === 0) {
    container.innerHTML = '<p style="color: var(--text-dim); padding: 1rem;">No data available.</p>';
    return;
  }

  container.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Service Name</th>
          <th>Total Appointments Booked</th>
          <th>Total Revenue Generated</th>
        </tr>
      </thead>
      <tbody>
        ${topServices.map((s, idx) => `
          <tr>
            <td><strong style="color: var(--gold-light);">#${idx + 1}</strong></td>
            <td><strong>${s.service_name}</strong></td>
            <td><span class="badge badge-gold">${s.count} bookings</span></td>
            <td style="font-weight: 700; color: var(--gold-light);">₹${(s.revenue || 0).toLocaleString('en-IN')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

