/* ═══════════════════════════════════════════════════════════════════════════
   SmartWaste — Admin Dashboard JS
   Requires: app.js (API_URL, fetchWithAuth, showToast, showModal, hideModal)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Init ──────────────────────────────────────────────────────────────────────
async function initAdminDashboard() {
    const role = localStorage.getItem('role');
    if (role !== 'admin') {
        window.location.href = '/frontend/login.html';
        return;
    }

    // Populate header user info
    const user = getUser();
    const nameEl   = document.getElementById('admin-name');
    const avatarEl = document.querySelector('.user-avatar');
    if (nameEl   && user.name) nameEl.textContent = user.name;
    if (avatarEl && user.name) avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=10b981&color=fff&bold=true`;

    // Load stats & kick off dynamic polling
    await fetchStats();
    await fetchDrivers();
    loadNotificationBadge();
    
    // Dynamic Simulation Polling
    setInterval(() => {
        fetchStats();
        loadNotificationBadge();
        
        // Auto-refresh reports if tab is active
        const rTab = document.getElementById('reports-tab');
        if (rTab && rTab.classList.contains('active')) {
            const activeFilter = document.querySelector('.filter-btn.active');
            fetchReports(activeFilter ? activeFilter.getAttribute('data-status') : 'all');
        }
        
        // Auto-refresh users if tab active and no search query pending
        const uTab = document.getElementById('users-tab');
        const searchInput = document.getElementById('userSearchInput');
        if (uTab && uTab.classList.contains('active') && (!searchInput || !searchInput.value)) {
            fetchAllUsers();
        }
    }, 5000);
}

// ── Tab Switching ─────────────────────────────────────────────────────────────
function switchTab(tabId, element) {
    document.querySelectorAll('.nav-link[data-tab]').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    const tab = document.getElementById(`${tabId}-tab`);
    if (tab) tab.classList.add('active');

    const meta = {
        overview: { title: 'Admin Overview',        desc: 'Real-time network status & analytics' },
        map:      { title: 'Network Map',            desc: 'Live waste report locations' },
        reports:  { title: 'Reports & Analytics',    desc: 'All citizen reports with filters' },
        users:    { title: 'User Management',        desc: 'Manage citizens, drivers & admins' },
    };
    const m = meta[tabId];
    if (m) {
        const titleEl = document.getElementById('tab-title');
        const descEl  = document.getElementById('tab-desc');
        if (titleEl) titleEl.textContent = m.title;
        if (descEl)  descEl.textContent  = m.desc;
    }

    if (tabId === 'map')     { setTimeout(initAdminMap, 100); }
    if (tabId === 'users')   { fetchAllUsers(); }
    if (tabId === 'reports') { fetchReports(); }
    if (tabId === 'overview') { fetchStats(); }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function fetchStats() {
    try {
        const res  = await fetchWithAuth(`${API_URL}/admin/stats`);
        if (!res.ok) return;
        const data = await res.json();

        setText('statTotal',    data.totalReports  || 0);
        setText('statPending',  data.pendingAction || 0);
        setText('statCollected',data.performance   || 0, '%');

        const fleetEl   = document.getElementById('statFleet');
        const fleetUtil = document.getElementById('statFleetUtil');
        if (fleetEl) fleetEl.textContent = `${data.activeFleet||0}/${data.activeDrivers||0}`;
        if (fleetUtil) {
            const util = data.activeDrivers > 0
                ? Math.round((data.activeFleet / data.activeDrivers) * 100) : 0;
            fleetUtil.textContent = `${util}% utilization`;
        }

        if (data.categories)   renderCompositionChart(data.categories);
        if (data.dailyReports) renderTrendChart(data.dailyReports);
        if (data.performance !== undefined) renderPerformanceChart(data.performance);

        // Store for map
        if (data.reports) {
            window.latestReports = data.reports;
            if (window.adminMap) renderMapMarkers(data.reports);
        }
    } catch (e) { console.error('Stats Error:', e); }
}

function setText(id, value, suffix = '') {
    const el = document.getElementById(id);
    if (el) el.textContent = value + suffix;
}

// ── Charts ────────────────────────────────────────────────────────────────────
function renderCompositionChart(categories) {
    const ctx = document.getElementById('typeChart');
    if (!ctx) return;
    if (window.compChart) window.compChart.destroy();

    const displayCats = categories.length ? categories : [{ _id: 'No Data', count: 1 }];
    const colors = ['#22c55e','#16a34a','#86efac','#f59e0b','#4ade80','#14b8a6','#a3e635'];

    window.compChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: displayCats.map(c => c._id),
            datasets: [{
                data: displayCats.map(c => c.count),
                backgroundColor: colors.slice(0, displayCats.length),
                borderWidth: 0, hoverOffset: 8,
                borderRadius: 4,
            }]
        },
        options: {
            cutout: '72%', maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} reports` } }
            },
            animation: { animateRotate: true, duration: 800 }
        }
    });

    // Render legend manually
    const legendEl = document.getElementById('chartLegend');
    if (legendEl) {
        legendEl.innerHTML = displayCats.map((c, i) => `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <span style="width:10px; height:10px; border-radius:50%; background:${colors[i]}; flex-shrink:0;"></span>
                <span style="font-size:0.83rem; color:#94a3b8;">${c._id}</span>
                <span style="margin-left:auto; font-size:0.83rem; font-weight:600;">${c.count}</span>
            </div>
        `).join('');
    }
}

function renderTrendChart(daily) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    if (window.trendChart) window.trendChart.destroy();

    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const labels = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        labels.push(days[d.getDay()]);
    }

    window.trendChart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Reports',
                data: daily,
                backgroundColor: 'rgba(34,197,94,0.2)',
                borderColor: '#22c55e',
                borderWidth: 2,
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 } } },
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', stepSize: 1, font: { size: 11 } } }
            },
            animation: { duration: 800 }
        }
    });
}

function renderPerformanceChart(percent) {
    const ctx = document.getElementById('perfChart');
    if (!ctx) return;
    if (window.perfChart) window.perfChart.destroy();

    const textEl = document.getElementById('perfChartText');
    if (textEl) textEl.textContent = percent + '%';

    window.perfChart = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [percent, Math.max(0, 100 - percent)],
                backgroundColor: ['#22c55e', 'rgba(255,255,255,0.06)'],
                borderWidth: 0, borderRadius: 6, hoverOffset: 0
            }]
        },
        options: {
            cutout: '82%', circumference: 220, rotation: -110,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { duration: 1000 }
        }
    });
}

// ── Map ───────────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
    pending:    '#f59e0b',
    dispatched: '#86efac',
    collected:  '#22c55e',
};

async function initAdminMap() {
    if (window.adminMap) {
        window.adminMap.invalidateSize();
        if (window.latestReports) renderMapMarkers(window.latestReports);
        return;
    }
    window.adminMap = L.map('map-container').setView([30.0444, 31.2357], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(window.adminMap);

    if (window.latestReports) renderMapMarkers(window.latestReports);
    else await fetchStats(); // triggers renderMapMarkers when data arrives
}

function renderMapMarkers(reports) {
    if (!window.adminMap) return;
    if (window.markerLayer) window.markerLayer.clearLayers();
    else {
        window.markerLayer = L.markerClusterGroup({
            maxClusterRadius: 40,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        }).addTo(window.adminMap);
    }

    reports.forEach(r => {
        if (!r.location?.lat) return;
        const color = STATUS_COLORS[r.status] || '#64748b';
        const icon  = L.divIcon({
            html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 6px ${color};"></div>`,
            className: '', iconSize: [14, 14], iconAnchor: [7, 7]
        });
        const marker = L.marker([r.location.lat, r.location.lng], { icon });
        marker.bindPopup(`
            <div style="font-family:Inter,sans-serif; font-size:13px;">
                <strong style="color:${color}">${r.category}</strong><br>
                <span>📍 ${r.location.address || 'Unknown'}</span><br>
                <span>Status: <b>${r.status}</b></span><br>
                ${r.description ? `<span style="color:#666;">${r.description}</span>` : ''}
            </div>
        `);
        window.markerLayer.addLayer(marker);
    });
}

// ── Reports Table ─────────────────────────────────────────────────────────────
let _allReports = [];

async function fetchReports(status = 'all') {
    try {
        const url = `${API_URL}/admin/reports?status=${status}`;
        const res = await fetchWithAuth(url);
        if (!res.ok) return;
        _allReports = await res.json();
        renderReportsTable(_allReports);
    } catch (e) { console.error('Reports fetch error:', e); }
}

function filterReports(status) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.filter-btn[data-status="${status}"]`);
    if (btn) btn.classList.add('active');
    fetchReports(status);
}

function renderReportsTable(reports) {
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) return;

    if (!reports.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#64748b;">No reports found</td></tr>`;
        return;
    }

    const statusBadge = s => {
        const map = { pending:'badge-warning', collected:'badge-primary', dispatched:'badge-blue' };
        return `<span class="badge ${map[s]||'badge-purple'}">${s}</span>`;
    };

    tbody.innerHTML = reports.map(r => `
        <tr>
            <td><code style="font-size:0.78rem;color:#64748b;">#${r._id}</code></td>
            <td><span style="font-weight:600;">${r.category}</span></td>
            <td>${statusBadge(r.status)}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.location?.address || '—'}</td>
            <td style="color:#94a3b8;">${r.reporterName || '—'}</td>
            <td style="color:#64748b;font-size:0.82rem;">${new Date(r.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
            <td>
                ${r.status === 'pending'
                    ? `<button class="btn-primary btn-sm" onclick="openAssignModal('${r._id}')">Assign</button>`
                    : `<span style="color:#64748b;font-size:0.82rem;">—</span>`
                }
            </td>
        </tr>
    `).join('');
}

// ── Assign Modal ──────────────────────────────────────────────────────────────
let _pendingAssignTaskId = null;

function openAssignModal(reportId) {
    _pendingAssignTaskId = reportId;
    const span = document.getElementById('assignReportId');
    if (span) span.textContent = `#${reportId}`;
    showModal('assignModal');
}

async function confirmAssignment() {
    if (!_pendingAssignTaskId) return;
    const select   = document.getElementById('driverSelect');
    const driverId = select && select.value;
    if (!driverId) { showToast('Please select a driver', 'error'); return; }

    try {
        const res = await fetchWithAuth(`${API_URL}/admin/assign-task/${_pendingAssignTaskId}`, {
            method: 'PATCH',
            body: JSON.stringify({ driverId })
        });
        if (res.ok) {
            showToast('Task assigned successfully!', 'success');
            hideModal('assignModal');
            _pendingAssignTaskId = null;
            fetchReports();
            fetchStats();
        } else {
            const d = await res.json();
            showToast(d.error || 'Failed to assign', 'error');
        }
    } catch { showToast('Connection error', 'error'); }
}

// ── Users Management ──────────────────────────────────────────────────────────
async function fetchAllUsers() {
    try {
        const res   = await fetchWithAuth(`${API_URL}/admin/users`);
        const users = await res.json();
        window.allUsersCache = users;
        renderUsers(users);
    } catch { showToast('Failed to load users', 'error'); }
}

function filterUsers() {
    const q = document.getElementById('userSearchInput')?.value.toLowerCase() || '';
    if (!window.allUsersCache) return;
    const filtered = window.allUsersCache.filter(u =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
    renderUsers(filtered);
}

function renderUsers(users) {
    const tbody = document.getElementById('userListRows');
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#64748b;">No users found</td></tr>`;
        return;
    }

    const roleBadge = r => {
        const map = { admin:'badge-purple', driver:'badge-warning', citizen:'badge-primary' };
        return `<span class="badge ${map[r]||'badge-primary'}">${r}</span>`;
    };

    tbody.innerHTML = users.map(u => `
        <tr id="user-row-${u._id}">
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=1e293b&color=94a3b8&size=32" style="width:32px;height:32px;border-radius:50%;">
                    <div>
                        <div style="font-weight:600;">${u.name}</div>
                        <div style="font-size:0.8rem;color:#64748b;">${u.email}</div>
                    </div>
                </div>
            </td>
            <td>${roleBadge(u.role)}</td>
            <td>
                <select onchange="changeUserRole('${u._id}', this.value)" 
                    style="background:#1e293b;color:white;border:1px solid rgba(255,255,255,0.1);padding:5px 8px;border-radius:6px;font-size:0.82rem;cursor:pointer;">
                    <option value="citizen" ${u.role==='citizen'?'selected':''}>Citizen</option>
                    <option value="driver"  ${u.role==='driver' ?'selected':''}>Driver</option>
                    <option value="admin"   ${u.role==='admin'  ?'selected':''}>Admin</option>
                </select>
            </td>
            <td><span class="eco-badge">🌿 ${u.ecoPoints||0}</span></td>
            <td style="color:#64748b;font-size:0.83rem;">${new Date(u.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="btn-danger btn-sm" onclick="confirmDeleteUser('${u._id}', '${u.name.replace(/'/g,"\\'")}')">
                    🗑 Delete
                </button>
            </td>
        </tr>
    `).join('');
}

async function changeUserRole(id, role) {
    try {
        const res = await fetchWithAuth(`${API_URL}/admin/users/${id}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role })
        });
        res.ok
            ? showToast(`Role updated to ${role}`, 'success')
            : showToast('Failed to update role', 'error');
    } catch { showToast('Connection error', 'error'); }
}

let _delUserId = null;
function confirmDeleteUser(id, name) {
    _delUserId = id;
    const span = document.getElementById('deleteUserName');
    if (span) span.textContent = name;
    showModal('deleteUserModal');
}

async function confirmDeleteFromModal() {
    if (!_delUserId) return;
    try {
        const res = await fetchWithAuth(`${API_URL}/admin/users/${_delUserId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('User deleted', 'success');
            hideModal('deleteUserModal');
            const row = document.getElementById(`user-row-${_delUserId}`);
            if (row) {
                row.style.transition = 'opacity 0.3s, transform 0.3s';
                row.style.opacity = '0'; row.style.transform = 'translateX(20px)';
                setTimeout(() => { row.remove(); }, 320);
            }
            _delUserId = null;
        } else {
            const d = await res.json();
            showToast(d.error || 'Delete failed', 'error');
        }
    } catch { showToast('Connection error', 'error'); }
}

// ── Drivers ───────────────────────────────────────────────────────────────────
async function fetchDrivers() {
    try {
        const res    = await fetchWithAuth(`${API_URL}/admin/drivers`);
        const drivers = await res.json();
        const select  = document.getElementById('driverSelect');
        if (select && Array.isArray(drivers)) {
            select.innerHTML = drivers.length
                ? drivers.map(d => `<option value="${d._id}">${d.name} (${d.status})</option>`).join('')
                : '<option value="">No drivers available</option>';
        }
    } catch { console.error('Drivers fetch error'); }
}

// ── Notifications ─────────────────────────────────────────────────────────────
async function loadNotificationBadge() {
    try {
        const res  = await fetchWithAuth(`${API_URL}/admin/pending-count`);
        if (!res.ok) return;
        const data = await res.json();
        const dot  = document.getElementById('notifDot');
        if (dot) dot.classList.toggle('show', data.count > 0);
        const badge = document.getElementById('notifBadgeCount');
        if (badge) badge.textContent = data.count;
    } catch { /* server offline */ }
}

// ── CSV Export ────────────────────────────────────────────────────────────────
async function exportCSV() {
    try {
        const token = localStorage.getItem('token');
        const res   = await fetch(`${API_URL}/admin/export-csv`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `smartwaste_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a); a.click(); a.remove();
            showToast('Report exported successfully!', 'success');
        } else {
            showToast('Export failed', 'error');
        }
    } catch { showToast('Connection error', 'error'); }
}
