const API_URL = 'http://localhost:5000/api';

// --- Shared Utility ---
function showModal(id) { document.getElementById(id).style.display = 'block'; }
function hideModal(id) { document.getElementById(id).style.display = 'none'; }

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

async function checkAuth() {
    const token = localStorage.getItem('token');
    const userString = localStorage.getItem('user');
    if (!token || !userString) return;

    let user = JSON.parse(userString);

    if (token) {
        if (document.getElementById('authButtons')) document.getElementById('authButtons').style.display = 'none';
        if (document.getElementById('userInfo')) document.getElementById('userInfo').style.display = 'flex';
        
        // Dynamic Nav Links
        const navLinks = document.querySelector('.nav-links');
        if (navLinks && !document.getElementById('rewardsLink')) {
            const rewards = document.createElement('a');
            rewards.id = 'rewardsLink';
            rewards.href = 'rewards.html';
            rewards.innerHTML = 'Eco Store';
            navLinks.appendChild(rewards);
        }

        // Refresh User Stats from Backend
        try {
            const res = await fetch(`${API_URL}/auth/profile/${user.id || user._id}`);
            if (res.ok) {
                const freshUser = await res.json();
                user = { ...user, ...freshUser };
                localStorage.setItem('user', JSON.stringify(user));
            }
        } catch (e) { console.warn('Stat sync failed'); }

        if (document.getElementById('userHandle')) document.getElementById('userHandle').innerText = user.name.split(' ')[0];
        if (document.getElementById('userPoints')) {
            document.getElementById('userPoints').innerHTML = `<i class="fas fa-coins"></i> ${user.ecoPoints || 0}`;
        }

        // Home Page Personal Impact Dashboard
        const personalImpact = document.getElementById('personalImpact');
        if (personalImpact && user.role === 'citizen') {
            personalImpact.style.display = 'block';
            const dashPoints = document.getElementById('dashPoints');
            if (dashPoints) dashPoints.innerText = user.ecoPoints || 0;
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
                alert(data.error);
            }
        } catch (err) {
            alert('Server connection failed');
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
            alert('Registration Successful. Please Sign In.');
            hideModal('registerModal');
            showModal('loginModal');
        } else {
            alert(data.error);
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
        if (!user.id) {
            alert('Authentication required for incident transmission.');
            return showModal('loginModal');
        }
        if (!currentCoords) return alert('Please secure GPS coordinates first.');

        const formData = new FormData();
        formData.append('category', document.getElementById('category').value);
        formData.append('description', document.getElementById('description').value);
        formData.append('lat', currentCoords.lat);
        formData.append('lng', currentCoords.lng);
        formData.append('userId', user.id);
        if (imgInput.files[0]) formData.append('images', imgInput.files[0]);

        toggleLoading(true);
        const res = await fetch(`${API_URL}/citizen/report`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        toggleLoading(false);
        if (data._id) {
            alert('Report Transmitted. Dispatch sequence initiated. Points earned!');
            window.location.href = 'index.html';
        }
    };
}

// --- Mobile Navigation ---
const mobileToggle = document.querySelector('.mobile-toggle');
const navLinks = document.querySelector('.nav-links');

if (mobileToggle) {
    mobileToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        mobileToggle.querySelector('i').classList.toggle('fa-bars');
        mobileToggle.querySelector('i').classList.toggle('fa-times');
    });
}

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
