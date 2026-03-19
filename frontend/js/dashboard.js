async function initAdminDashboard() {
    const role = localStorage.getItem('role');
    if (role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    // Execute all fetches concurrently so one failure doesn't block others
    fetchStats().catch(err => console.error('Stats Error:', err));
    fetchDrivers().catch(err => console.error('Drivers Error:', err));
    if (typeof initAdminMap === 'function') {
        initAdminMap().catch(err => console.error('Map Error:', err));
    }

    // Load notification badge count
    loadNotificationBadge();
    // Poll every 60 seconds for new pending reports
    setInterval(loadNotificationBadge, 60000);

    // Wire up CSV export with auth token in the URL
    const token = localStorage.getItem('token');
    const csvLink = document.getElementById('csvExportBtn');
    if (csvLink && token) {
        csvLink.href = `/api/admin/export-csv?token=${token}`;
    }
}

async function loadNotificationBadge() {
    try {
        const res = await fetchWithAuth(`${API_URL}/admin/pending-count`);
        if (!res || !res.ok) return;
        const { count } = await res.json();
        const badge = document.getElementById('notifBadge');
        if (!badge) return;
        if (count > 0) {
            badge.innerText = count > 9 ? '9+' : count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    } catch (e) {}
}

async function exportCSV() {
    const btn = document.getElementById('csvExportBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...'; }
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/admin/export-csv`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            showToast('Export failed. Please try again.', 'error');
            return;
        }
        // Trigger browser download from the blob response
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartwaste-reports-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast('Reports exported successfully!', 'success');
    } catch (err) {
        showToast('Export failed. Check your connection.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-csv"></i> Export'; }
    }
}


async function fetchStats() {
    const res = await fetchWithAuth(`${API_URL}/admin/stats`);
    if (!res || !res.ok) return;
    const data = await res.json();
    
    // Update Counter Widgets
    document.getElementById('statTotal').innerText = data.total;
    document.getElementById('statPending').innerText = data.pending;
    
    const fleetEl = document.getElementById('statFleet');
    const fleetUtilEl = document.getElementById('statFleetUtil');
    if (fleetEl && fleetUtilEl) {
        const active = data.activeDrivers || 0;
        const totalD = data.totalDrivers || 0;
        fleetEl.innerText = `${active}/${totalD}`;
        const util = totalD > 0 ? Math.round((active / totalD) * 100) : 0;
        fleetUtilEl.innerText = `${util}% utilization`;
    }
    
    // Update Recent Reports Table
    const tableBody = document.getElementById('reportsTable');
    tableBody.innerHTML = '';

    data.recentReports.forEach(report => {
        const row = `
            <tr>
                <td>${new Date(report.createdAt).toLocaleDateString()}</td>
                <td><span style="font-weight: 700; color: var(--primary);">${report.category.toUpperCase()}</span></td>
                <td><div style="display:flex; align-items:center; gap:8px;"><i class="fas fa-location-dot" style="font-size:0.8rem;"></i> ${report.location.address ? report.location.address.substring(0,25)+'...' : 'GEO-LOCATED'}</div></td>
                <td>${report.reportedBy ? report.reportedBy.name : 'Anonymous'}</td>
                <td><span class="badge ${report.status}">${report.status}</span></td>
                <td>
                    ${report.status === 'pending' ? `
                        <button class="btn-premium" style="padding: 6px 15px; font-size:0.8rem;" onclick="openAssignModal('${report._id}')">
                            <i class="fas fa-paper-plane"></i> Dispatch
                        </button>
                    ` : '<i class="fas fa-check-circle" style="color:var(--primary);"></i> SECURED'}
                </td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });

    // Render Charts
    renderCompositionChart(data.categories);
    renderTrendChart(data.dailyReports);
    renderPerformanceChart(data.performance);
}

function renderCompositionChart(categories) {
    const ctx = document.getElementById('typeChart').getContext('2d');
    if (window.compChart) window.compChart.destroy();

    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#ec4899', '#8b5cf6'];
    const total = categories.reduce((acc, c) => acc + c.count, 0);

    window.compChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categories.map(c => String(c._id || 'Unknown').toUpperCase()),
            datasets: [{
                data: categories.map(c => c.count),
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 15
            }]
        },
        options: {
            cutout: '75%',
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });

    // Update Metrics
    const metricsCont = document.getElementById('compMetrics');
    metricsCont.innerHTML = '';
    categories.slice(0, 3).forEach((c, i) => {
        const percent = Math.round((c.count / total) * 100) || 0;
        metricsCont.innerHTML += `
            <div class="metric-item">
                <div class="metric-info"><span>${String(c._id || 'Unknown').toUpperCase()}</span><span>${percent}%</span></div>
                <div class="progress-bar"><div class="fill" style="width: ${percent}%; background: ${colors[i % colors.length]};"></div></div>
            </div>
        `;
    });
}

function renderTrendChart(dailyReports) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (window.trendChart) window.trendChart.destroy();

    window.trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dailyReports.map(d => d._id),
            datasets: [{
                label: 'Reports',
                data: dailyReports.map(d => d.count),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#10b981',
                pointRadius: 4
            }]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { 
                    suggestedMin: 0, 
                    suggestedMax: 10, 
                    grid: { color: 'rgba(255,255,255,0.05)' }, 
                    ticks: { color: '#94a3b8', stepSize: 1 } 
                },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function renderPerformanceChart(percent) {
    const ctx = document.getElementById('perfChart').getContext('2d');
    if (window.perfChart) window.perfChart.destroy();
    
    // Update center text display
    const labelEl = document.getElementById('perfChartText');
    if (labelEl) labelEl.innerText = percent + '%';

    window.perfChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Collected', 'Pending'],
            datasets: [{
                data: [percent, 100 - percent],
                backgroundColor: ['#10b981', 'rgba(255,255,255,0.15)'],
                borderWidth: 0
            }]
        },
        options: {
            cutout: '85%',
            rotation: -90,
            circumference: 180,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}

async function fetchDrivers() {
    const res = await fetchWithAuth(`${API_URL}/admin/drivers`);
    if (!res || !res.ok) return;
    const drivers = await res.json();
    const select = document.getElementById('driverSelect');
    if (select) {
        select.innerHTML = '<option value="">Select Available Dispatch Unit...</option>';
        drivers.forEach(d => {
            const dId = String(d._id);
            const dNm = String(d.name || 'Unknown');
            select.innerHTML += `<option value="${dId}">${dNm.toUpperCase()} (ID: ${dId.substr(-4)})</option>`;
        });
    }
}

function openAssignModal(reportId) {
    document.getElementById('assignReportId').innerText = reportId;
    showModal('assignModal');
}

async function confirmAssignment() {
    const reportId = document.getElementById('assignReportId').innerText;
    const driverId = document.getElementById('driverSelect').value;

    if (!driverId) return showToast('Please select a dispatch unit.', 'error');

    const res = await fetchWithAuth(`${API_URL}/admin/assign-task`, {
        method: 'POST',
        body: JSON.stringify({ reportId, driverId })
    });
    
    if (res && res.ok) {
        hideModal('assignModal');
        showToast('Unit dispatched successfully!', 'success');
        fetchStats();
    }
}

// --- Tab & New Features Logic ---
function switchTab(tabId, element) {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(`${tabId}-tab`).style.display = 'block';

    if (tabId === 'fleet') fetchFleetStatus();
    if (tabId === 'users') fetchAllUsers();
    
    // Trigger map resize if switching to map tab (Leaflet workaround)
    if (tabId === 'map' && typeof window.dispatchEvent === 'function') {
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    }
}

async function fetchFleetStatus() {
    const res = await fetchWithAuth(`${API_URL}/admin/drivers`);
    if (!res || !res.ok) return;
    const drivers = await res.json();
    const tbody = document.getElementById('fleetTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (drivers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No drivers found in the system.</td></tr>';
        return;
    }

    drivers.forEach(d => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><i class="fas fa-truck" style="color:var(--primary); margin-right:8px;"></i> ${d.name}</td>
            <td>${d.email}</td>
            <td><strong>${d.ecoPoints || 0}</strong></td>
            <td><span class="badge ${d.status === 'Idle' ? 'collected' : 'pending'}">${d.status || 'Active'}</span></td>
            <td>${d.activeMission ? `<span style="font-family:monospace; color:var(--accent);">#${d.activeMission.substr(-6)}</span>` : 'None'}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function fetchAllUsers() {
    const res = await fetchWithAuth(`${API_URL}/admin/users`);
    if (!res || !res.ok) return;
    window.allUsersCache = await res.json();
    renderUsers(window.allUsersCache);
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    users.forEach(u => {
        const roleOptions = ['citizen', 'driver', 'admin']
            .map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r.toUpperCase()}</option>`)
            .join('');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div style="font-weight:600;">${u.name}</div></td>
            <td>${u.email}</td>
            <td>
                <select class="role-select" style="background:rgba(255,255,255,0.05); color:white; border:1px solid var(--glass-border); padding:4px 8px; border-radius:6px; outline:none;" onchange="changeUserRole('${u._id}', this.value)">
                    ${roleOptions}
                </select>
            </td>
            <td style="color:var(--primary); font-weight:700;">${u.ecoPoints || 0}</td>
            <td style="font-size:0.85rem; color:var(--text-muted);">${new Date(u.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="btn-icon" style="color:#ef4444; border-color:rgba(239,68,68,0.2);" onclick="deleteUser('${u._id}', '${u.name}')" title="Delete User">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function changeUserRole(userId, newRole) {
    const res = await fetchWithAuth(`${API_URL}/admin/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole })
    });
    
    if (res && res.ok) {
        showToast('User permissions updated successfully', 'success');
    } else {
        showToast('Failed to update user role', 'error');
        fetchAllUsers(); // revert changes visually
    }
}

async function deleteUser(userId, name) {
    const modal = document.getElementById('deleteConfirmModal');
    const nameSpan = document.getElementById('deleteUserName');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (!modal || !nameSpan || !confirmBtn) {
        // Fallback for safety
        if (!confirm(`Are you sure you want to delete user "${name}"?`)) return;
        return proceedWithDeletion(userId);
    }

    nameSpan.innerText = name;
    showModal('deleteConfirmModal');

    // Remove any previous listeners to avoid multiple triggers
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.onclick = async () => {
        newConfirmBtn.disabled = true;
        newConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        await proceedWithDeletion(userId);
        hideModal('deleteConfirmModal');
    };
}

async function proceedWithDeletion(userId) {
    try {
        const res = await fetchWithAuth(`${API_URL}/admin/users/${userId}`, {
            method: 'DELETE'
        });
        
        if (res && res.ok) {
            showToast('User deleted successfully', 'success');
            fetchAllUsers(); // Refresh list
        } else {
            const data = await res.json();
            showToast(data.error || 'Failed to delete user', 'error');
        }
    } catch (err) {
        showToast('Error deleting user', 'error');
    }
}

function filterUsers() {
    const q = document.getElementById('userSearch').value.toLowerCase();
    if (!window.allUsersCache) return;
    if (!q) return renderUsers(window.allUsersCache);
    
    const filtered = window.allUsersCache.filter(u => 
        u.name.toLowerCase().includes(q) || 
        u.email.toLowerCase().includes(q)
    );
    renderUsers(filtered);
}

document.addEventListener('DOMContentLoaded', initAdminDashboard);

