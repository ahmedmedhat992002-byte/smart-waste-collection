const API_URL = '/api';

// --- Shared Utility ---
function showModal(id) { document.getElementById(id).style.display = 'block'; }
function hideModal(id) { document.getElementById(id).style.display = 'none'; }

function toggleMenu() {
    const nav = document.getElementById('navLinks');
    const auth = document.getElementById('authSection') || document.querySelector('.nav-auth');
    if (nav) nav.classList.toggle('active');
    if (auth && window.innerWidth <= 768) auth.classList.toggle('active');
}

// --- Theme Toggle ---
function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    // Update icon on any theme-toggle buttons
    document.querySelectorAll('.theme-toggle i').forEach(el => {
        el.className = isLight ? 'fas fa-moon' : 'fas fa-sun';
    });
}
// Apply saved theme on load
(function applyTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
        document.body.classList.add('light-mode');
        // Icon will update once DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('.theme-toggle i').forEach(el => el.className = 'fas fa-moon');
        });
    }
})();


function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-info-circle'}"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Helper for Authenticated API Calls
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('CRITICAL: fetchWithAuth called but NO TOKEN found in localStorage.');
    }

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // If body is FormData, don't set Content-Type (browser will set it with boundary)
    if (options.body instanceof FormData) {
        delete headers['Content-Type'];
    }

    try {
        const response = await fetch(url, { ...options, headers });
        
        if (response.status === 401) {
            console.warn('Unauthorized (401) - Clearing session');
            localStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        
        return response;
    } catch (err) {
        console.error('Fetch error in fetchWithAuth:', err);
        throw err;
    }
}

async function checkAuth() {
    const token = localStorage.getItem('token');
    const userString = localStorage.getItem('user');
    if (!token || !userString) return;

    let user = JSON.parse(userString);

    if (token) {
        if (document.getElementById('authButtons')) document.getElementById('authButtons').style.display = 'none';
        if (document.getElementById('userInfo')) document.getElementById('userInfo').style.display = 'flex';
        
        // --- Dynamic Nav Control ---
        const activeUser = JSON.parse(localStorage.getItem('user') || '{}');
        const isAdmin = activeUser.role === 'admin';
        
        // Find and toggle Admin link
        const navLinks = document.getElementById('navLinks') || document.querySelector('.nav-links');
        if (navLinks) {
            const adminLink = Array.from(navLinks.querySelectorAll('a')).find(a => a.textContent.includes('Admin'));
            if (adminLink) adminLink.style.display = isAdmin ? 'block' : 'none';

            // Add Eco Store if missing
            if (!document.getElementById('rewardsLink')) {
                const rewards = document.createElement('a');
                rewards.id = 'rewardsLink';
                rewards.href = 'rewards.html';
                rewards.innerHTML = 'Eco Store';
                navLinks.appendChild(rewards);
            }
        }

        // Refresh User Stats from Backend
        try {
            const res = await fetchWithAuth(`${API_URL}/auth/profile/${user.id || user._id}`);
            if (res && res.ok) {
                const freshUser = await res.json();
                user = { ...user, ...freshUser };
                localStorage.setItem('user', JSON.stringify(user));
            }
        } catch (e) { console.warn('Stat sync failed'); }

        if (document.getElementById('userHandle')) {
            document.getElementById('userHandle').innerText = user.name.split(' ')[0];
        }
        if (document.getElementById('userPoints')) {
            document.getElementById('userPoints').innerHTML = `<i class="fas fa-coins"></i> ${user.ecoPoints || 0}`;
        }
    }
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// --- Auth Systems ---
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPass').value;
        toggleLoading(true);
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.token) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.user.role);
                localStorage.setItem('user', JSON.stringify(data.user));
                
                toggleLoading(false);
                // Redirect based on role
                if (data.user.role === 'admin') window.location.href = 'dashboard.html';
                else if (data.user.role === 'driver') window.location.href = 'driver.html';
                else if (data.user.role === 'citizen') window.location.href = 'index.html';
                else window.location.reload();
            } else {
                toggleLoading(false);
                showToast(data.error || 'Login failed. Check your credentials.', 'error');
            }
        } catch (err) {
            toggleLoading(false);
            showToast('Server connection failed. Please try again.', 'error');
        }
    };
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('regUser').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPass').value;
        const role = document.getElementById('regRole').value;
        
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, role })
        });
        const data = await res.json();
        if (data.message) {
            showToast('Registration Successful! Please Sign In.', 'success');
            hideModal('registerModal');
            showModal('loginModal');
        } else {
            showToast(data.error || 'Registration failed. Try again.', 'error');
        }
    };
}

// --- Incident Reporting ---
const reportForm = document.getElementById('reportForm');
let currentCoords = null;

if (reportForm) {
    const imgInput = document.getElementById('imageInput');
    imgInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (f) => {
                const preview = document.getElementById('imagePreview');
                preview.innerHTML = `<img src="${f.target.result}" style="width: 100%; height: 100%; object-fit: cover;">`;
            }
            reader.readAsDataURL(file);
        }
    };

    document.getElementById('getLocation').onclick = () => {
        if (navigator.geolocation) {
            document.getElementById('locationStatus').innerText = "CALIBRATING GPS...";
            navigator.geolocation.getCurrentPosition((pos) => {
                currentCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                document.getElementById('locationStatus').innerText = `COORDINATES SECURED: ${currentCoords.lat.toFixed(4)}, ${currentCoords.lng.toFixed(4)}`;
                if (window.updateMapMarker) window.updateMapMarker(currentCoords);
            }, (err) => {
                document.getElementById('locationStatus').innerText = "GPS FAILURE: DENIED";
                alert("Location access is required for precise waste dispatch.");
            });
        }
    };

    reportForm.onsubmit = async (e) => {
        e.preventDefault();
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const token = localStorage.getItem('token');
        
        if (!user.id || !token) {
            showToast('Authentication required. Session may have expired.', 'error');
            return showModal('loginModal');
        }
        if (!currentCoords) return showToast('Please secure GPS coordinates first.', 'error');

        const formData = new FormData();
        formData.append('category', document.getElementById('category').value);
        formData.append('description', document.getElementById('description').value);
        formData.append('lat', currentCoords.lat);
        formData.append('lng', currentCoords.lng);
        formData.append('userId', user.id);
        if (imgInput.files[0]) formData.append('images', imgInput.files[0]);

        toggleLoading(true);
        try {
            const res = await fetchWithAuth(`${API_URL}/citizen/report`, {
                method: 'POST',
                body: formData
            });
            if (!res) return; // fetchWithAuth might have redirected
            
            const data = await res.json();
            toggleLoading(false);
            if (data._id) {
                showToast('Report Transmitted! Eco-points earned 🌱', 'success');
                setTimeout(() => window.location.href = 'index.html', 2000);
            } else {
                showToast(data.error || 'Report failed. Please try again.', 'error');
            }
        } catch (err) {
            toggleLoading(false);
            showToast('Submission failed. Check your connection.', 'error');
        }
    };
}

// --- Mobile Navigation ---
const mobileToggle = document.querySelector('.mobile-toggle');
const navLinksContainer = document.querySelector('.nav-links');
if (mobileToggle && navLinksContainer) {
    mobileToggle.addEventListener('click', () => {
        navLinksContainer.classList.toggle('active');
        mobileToggle.querySelector('i').classList.toggle('fa-bars');
        mobileToggle.querySelector('i').classList.toggle('fa-times');
    });
}

// --- Public Stats (Homepage) ---
async function loadPublicStats() {
    const weightEl = document.getElementById('impactWeight');
    const citizensEl = document.getElementById('impactCitizens');
    const efficiencyEl = document.getElementById('impactEfficiency');

    if (!weightEl || !citizensEl || !efficiencyEl) return;

    try {
        const res = await fetch(`${API_URL}/public/stats`);
        if (res.ok) {
            const data = await res.json();
            
            // Basic animation
            animateValue(weightEl, 0, parseFloat(data.wasteCollected), 1500, 't');
            animateValue(citizensEl, 0, parseFloat(data.activeCitizens), 1500, data.activeCitizens.includes('k') ? 'k' : '');
            animateValue(efficiencyEl, 0, parseInt(data.recyclingEfficiency), 1500, '%');
        }
    } catch (err) {
        console.error("Could not load public stats", err);
    }
}

function animateValue(obj, start, end, duration, suffix = '') {
    if (isNaN(end)) {
        obj.innerHTML = end + suffix; // Fallback if parsing failed
        return;
    }
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        
        // Use precision based on the end value
        const currentVal = progress * (end - start) + start;
        const displayVal = Number.isInteger(end) ? Math.floor(currentVal) : currentVal.toFixed(1);
        
        obj.innerHTML = displayVal + suffix;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Auto-load stats if we're on a page with these elements
document.addEventListener('DOMContentLoaded', loadPublicStats);

// Close modals on overlay click
window.onclick = (event) => {
    if (event.target.classList.contains('modal-overlay')) {
        event.target.style.display = 'none';
    }
}

// Centralized Loading Utility
function toggleLoading(show) {
    let loader = document.getElementById('globalLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'globalLoader';
        loader.className = 'loader-overlay';
        loader.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(loader);
    }
    loader.style.display = show ? 'flex' : 'none';
}

checkAuth();
