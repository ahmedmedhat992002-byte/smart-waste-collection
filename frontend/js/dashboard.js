async function initAdminDashboard() {
    const role = localStorage.getItem('role');
    if (role !== 'admin') {
        alert('ACCESS DENIED: Administrative Credentials Required.');
        window.location.href = 'index.html';
        return;
    }

    try {
        await fetchStats();
        await fetchDrivers();
    } catch (err) {
        console.error('Dashboard Sync Error:', err);
    }
}

async function fetchStats() {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    
    // Update Counter Widgets
    document.getElementById('statTotal').innerText = data.total;
    document.getElementById('statPending').innerText = data.pending;
    
    // Update Recent Reports Table
    const tableBody = document.getElementById('reportsTable');
    tableBody.innerHTML = '';

    data.recentReports.forEach(report => {
        const row = `
            <tr>
                <td>${new Date(report.createdAt).toLocaleDateString()}</td>
                <td><span style="font-weight: 700; color: var(--primary);">${report.category.toUpperCase()}</span></td>
                <td><div style="display:flex; align-items:center; gap:8px;"><i class="fas fa-location-dot" style="font-size:0.8rem;"></i> ${report.location.address ? report.location.address.substring(0,25)+'...' : 'GEO-LOCATED'}</div></td>
                <td>${report.reportedBy ? report.reportedBy.username : 'Anonymous'}</td>
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
            labels: categories.map(c => c._id.toUpperCase()),
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
        const percent = Math.round((c.count / total) * 100);
        metricsCont.innerHTML += `
            <div class="metric-item">
                <div class="metric-info"><span>${c._id.toUpperCase()}</span><span>${percent}%</span></div>
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
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function renderPerformanceChart(percent) {
    const ctx = document.getElementById('perfChart').getContext('2d');
    if (window.perfChart) window.perfChart.destroy();

    window.perfChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Collected', 'Pending'],
            datasets: [{
                data: [percent, 100 - percent],
                backgroundColor: ['#10b981', 'rgba(255,255,255,0.05)'],
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
    const res = await fetch('/api/admin/drivers');
    const drivers = await res.json();
    const select = document.getElementById('driverSelect');
    if (select) {
        select.innerHTML = '<option value="">Select Available Dispatch Unit...</option>';
        drivers.forEach(d => {
            select.innerHTML += `<option value="${d._id}">${d.username.toUpperCase()} (ID: ${d._id.substr(-4)})</option>`;
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

    if (!driverId) return alert('Please select a dispatch unit.');

    const res = await fetch('/api/admin/assign-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, driverId })
    });
    
    if (res.ok) {
        hideModal('assignModal');
        initAdminDashboard();
        // Simulation: Trigger notification for driver (socket.io would be used here in production)
    }
}
