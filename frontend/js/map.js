let map;
let markers = [];
const MAP_STYLE = [
    { "elementType": "geometry", "stylers": [{ "color": "#020617" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "elementType": "labels.text.stroke", "stylers": [{ "color": "#020617" }] },
    { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#334155" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#000000" }] }
];

function initReportMap() {
    const defaultLoc = { lat: 40.7128, lng: -74.0060 };
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 15,
        center: defaultLoc,
        styles: MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
    });

    const marker = new google.maps.Marker({
        map: map,
        draggable: true,
        animation: google.maps.Animation.DROP,
        position: defaultLoc,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: '#10b981',
            fillOpacity: 1,
            strokeWeight: 2,
            strokeColor: '#ffffff',
            scale: 8
        }
    });

    window.updateMapMarker = (coords) => {
        if (map && marker) {
            map.setCenter(coords);
            marker.setPosition(coords);
        }
    };
}

async function initAdminMap() {
    try {
        const res = await fetch('http://localhost:5000/api/admin/reports');
        const reports = await res.json();
        
        map = new google.maps.Map(document.getElementById("adminMap"), {
            zoom: 12,
            center: { lat: 40.7128, lng: -74.0060 },
            styles: MAP_STYLE,
            disableDefaultUI: true,
            zoomControl: true,
        });

        reports.forEach(report => {
            const color = report.status === 'pending' ? '#f59e0b' : '#10b981';
            const marker = new google.maps.Marker({
                position: { lat: parseFloat(report.location.lat), lng: parseFloat(report.location.lng) },
                map: map,
                title: report.category,
                icon: {
                    path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                    fillColor: color,
                    fillOpacity: 1,
                    strokeWeight: 1,
                    strokeColor: '#ffffff',
                    scale: 6
                }
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="padding: 10px; color: #020617; max-width: 200px;">
                        <h4 style="margin: 0 0 5px 0; color: #10b981;">${report.category.toUpperCase()}</h4>
                        <p style="margin: 0 0 8px 0; font-size: 0.85rem;">${report.description || 'No description provided.'}</p>
                        <div style="display: flex; align-items: center; gap: 5px;">
                            <span style="font-size: 0.75rem; padding: 2px 6px; background: ${color}22; color: ${color}; border-radius: 4px; font-weight: 600;">
                                ${report.status.toUpperCase()}
                            </span>
                        </div>
                    </div>
                `
            });

            marker.addListener("click", () => {
                infoWindow.open(map, marker);
            });
            
            markers.push(marker);
        });

        if (reports.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            reports.forEach(r => bounds.extend({ lat: parseFloat(r.location.lat), lng: parseFloat(r.location.lng) }));
            map.fitBounds(bounds);
        }
    } catch (err) {
        console.error("Failed to load map reports:", err);
    }
}
