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
        let waypoints = [];

        // 1. GET DRIVER 'S CURRENT GPS LOCATION
        navigator.geolocation.getCurrentPosition(async (position) => {
            const driverLat = position.coords.latitude;
            const driverLng = position.coords.longitude;
            const driverPos = [driverLat, driverLng];
            bounds.push(driverPos);
            waypoints.push(`${driverLng},${driverLat}`); // OSRM uses lng,lat

            // Add Driver Marker
            const driverIcon = L.divIcon({
                className: 'driver-marker',
                html: `<div style="background:var(--secondary); color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #fff; box-shadow:0 0 15px rgba(59,130,246,0.8);"><i class="fas fa-truck"></i></div>`,
                iconSize: [28, 28]
            });
            L.marker(driverPos, { icon: driverIcon }).bindPopup('<b>Your Current Location</b>').addTo(driverRouteLayer);

            // 2. PLOT DESTINATIONS
            tasks.forEach((task, index) => {
                const pos = [parseFloat(task.location.lat), parseFloat(task.location.lng)];
                bounds.push(pos);
                waypoints.push(`${pos[1]},${pos[0]}`);

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

            // 3. FETCH OSRM ROUTING DATA
            if (waypoints.length > 1) {
                try {
                    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${waypoints.join(';')}?overview=full&geometries=geojson`;
                    const osrmRes = await fetch(osrmUrl);
                    const osrmData = await osrmRes.json();

                    if (osrmData.routes && osrmData.routes.length > 0) {
                        const routeCoords = osrmData.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]); // GeoJSON is [lng, lat]
                        L.polyline(routeCoords, { color: '#3b82f6', weight: 5, opacity: 0.8 }).addTo(driverRouteLayer);
                    }
                } catch (e) {
                    console.error("OSRM Error:", e);
                    // Fallback to straight lines if OSRM fails
                    const fallbackCoords = waypoints.map(wp => { const parts = wp.split(','); return [parseFloat(parts[1]), parseFloat(parts[0])]; });
                    L.polyline(fallbackCoords, { color: '#10b981', weight: 4, dashArray: '10, 10' }).addTo(driverRouteLayer);
                }
            }

            if (bounds.length > 0) {
                driverMapInstance.fitBounds(bounds, { padding: [50, 50] });
            }

        }, (error) => {
            console.error("Geolocation Error:", error);
            showToast("Failed to get GPS location. Showing tasks normally.", "error");
            
            // Fallback: Plot without driver location
            tasks.forEach((task, index) => {
                const pos = [parseFloat(task.location.lat), parseFloat(task.location.lng)];
                bounds.push(pos);
                waypoints.push(`${pos[1]},${pos[0]}`);

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

            // Fallback routing
            if (waypoints.length > 1) {
                const fallbackCoords = waypoints.map(wp => { const parts = wp.split(','); return [parseFloat(parts[1]), parseFloat(parts[0])]; });
                L.polyline(fallbackCoords, { color: '#10b981', weight: 4, dashArray: '10, 10' }).addTo(driverRouteLayer);
            }

            if (bounds.length > 0) driverMapInstance.fitBounds(bounds, { padding: [50, 50] });
        }, { enableHighAccuracy: true });
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
