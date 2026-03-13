let driverMapInstance = null;
let driverRouteLayer = null;

function switchDriverTab(tabId, element) {
    // UI Update
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(`${tabId}-tab`).style.display = 'block';

    // Logic Dispatch
    if (tabId === 'route') {
        setTimeout(() => {
            initDriverMap();
            window.dispatchEvent(new Event('resize')); 
        }, 100);
    } else if (tabId === 'fuel') {
        fetchFuelLogs();
    }
}

async function initDriverMap() {
    if (driverMapInstance) return fetchRoutePlan(); // Already loaded, just fetch

    driverMapInstance = L.map('driverMap', {
        center: [40.7128, -74.0060], // Default NYC
        zoom: 12,
        zoomControl: true,
        attributionControl: false
    });

    const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
    L.tileLayer(DARK_TILES, { attribution: ATTRIBUTION }).addTo(driverMapInstance);

    driverRouteLayer = L.layerGroup().addTo(driverMapInstance);
    fetchRoutePlan();
}

async function fetchRoutePlan() {
    try {
        const res = await fetchWithAuth(`${API_URL}/driver/route-plan`);
        if (!res || !res.ok) return;
        const data = await res.json();
        const tasks = data.tasks || [];

        driverRouteLayer.clearLayers();
        const bounds = [];
        let latlngs = [];

        tasks.forEach((task, index) => {
            const pos = [parseFloat(task.location.lat), parseFloat(task.location.lng)];
            bounds.push(pos);
            latlngs.push(pos);

            const icon = L.divIcon({
                className: 'route-marker',
                html: `<div style="background:var(--primary); color:#020617; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; border:2px solid #fff; box-shadow:0 0 10px rgba(16,185,129,0.8);">${index + 1}</div>`,
                iconSize: [24, 24]
            });

            L.marker(pos, { icon }).bindPopup(`
                <div style="padding:10px; color:#fff; background:#020617; border-radius:8px;">
                    <h4 style="margin:0 0 5px; color:#10b981;">Stop ${index + 1}: ${task.category.toUpperCase()}</h4>
                    <p style="margin:0; font-size:0.8rem; color:#94a3b8;">${task.location.address || 'GPS Coord'}</p>
                </div>
            `, { className: 'glass-popup' }).addTo(driverRouteLayer);
        });

        // Draw line between stops
        if (latlngs.length > 1) {
            L.polyline(latlngs, { color: '#10b981', weight: 4, dashArray: '10, 10' }).addTo(driverRouteLayer);
        }

        if (bounds.length > 0) {
            driverMapInstance.fitBounds(bounds, { padding: [50, 50] });
        }
    } catch (err) {
        console.error("Failed to load route plan:", err);
    }
}

async function fetchFuelLogs() {
    try {
        const res = await fetchWithAuth(`${API_URL}/driver/fuel-log`);
        if (!res || !res.ok) return;
        const logs = await res.json();
        
        const tbody = document.getElementById('fuelTable');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No refueling records found.</td></tr>';
            return;
        }

        logs.forEach(log => {
            tbody.innerHTML += `
                <tr>
                    <td>${new Date(log.createdAt).toLocaleDateString()}</td>
                    <td style="color:var(--primary); font-weight:bold;">${log.liters.toFixed(1)} L</td>
                    <td>$${log.cost.toFixed(2)}</td>
                    <td style="font-family:monospace;">${log.odometer.toLocaleString()}</td>
                    <td><span style="color:var(--text-muted); font-size:0.8rem;">${log.notes || '-'}</span></td>
                </tr>
            `;
        });
    } catch (err) {
        console.error("Failed to load fuel logs:", err);
    }
}

async function submitFuelLog(e) {
    e.preventDefault();
    const btn = document.getElementById('fuelSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

    const liters = document.getElementById('fuelLiters').value;
    const cost = document.getElementById('fuelCost').value;
    const odometer = document.getElementById('fuelOdo').value;
    const notes = document.getElementById('fuelNotes').value;
    const receipt = document.getElementById('fuelReceipt').files[0];

    const formData = new FormData();
    formData.append('liters', liters);
    formData.append('cost', cost);
    formData.append('odometer', odometer);
    formData.append('notes', notes);
    if (receipt) formData.append('receipt', receipt);

    try {
        const res = await fetchWithAuth(`${API_URL}/driver/fuel-log`, {
            method: 'POST',
            body: formData // fetchWithAuth handles FormData headers automatically
        });

        if (res && res.ok) {
            showToast('Refuel log submitted successfully!', 'success');
            document.getElementById('fuelForm').reset();
            fetchFuelLogs(); // Refresh table
        } else {
            showToast('Failed to submit log.', 'error');
        }
    } catch (err) {
        console.error("Fuel log submission error:", err);
        showToast('Connection error.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Submit Log';
    }
}
