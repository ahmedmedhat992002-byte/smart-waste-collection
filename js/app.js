/* ═══════════════════════════════════════════════════════════════════════════
   SmartWaste — Global Application JS
   Loaded on EVERY page. Provides: API config, auth helpers, toast, modals,
   scroll reveals, counter animations, contact form, page loader.
   ═══════════════════════════════════════════════════════════════════════════ */

const API_URL = '/api';

// ── Toast Notification ────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    let toast = document.getElementById('globalToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'globalToast';
        document.body.appendChild(toast);
    }
    const isSuccess = type === 'success';
    toast.textContent = msg;
    toast.style.cssText = `
        position:fixed; bottom:28px; right:28px; z-index:99999;
        padding:14px 22px; border-radius:12px;
        font-weight:600; font-size:0.9rem; max-width:320px;
        font-family:inherit; pointer-events:none;
        background: ${isSuccess ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'};
        color: ${isSuccess ? '#10b981' : '#f87171'};
        border: 1px solid ${isSuccess ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'};
        opacity:1; transform:translateY(0);
        transition: opacity 0.4s ease, transform 0.4s ease;
        backdrop-filter: blur(12px);
    `;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
    }, 3500);
}

// ── Modal Helpers ─────────────────────────────────────────────────────────────
function showModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'flex';
    setTimeout(() => el.classList.add('active'), 10);
}
function hideModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    setTimeout(() => { el.style.display = 'none'; }, 300);
}

// ── Authenticated Fetch ───────────────────────────────────────────────────────
async function fetchWithAuth(url, opts = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(opts.headers || {})
    };
    return fetch(url, { ...opts, headers });
}

// ── Auth State ────────────────────────────────────────────────────────────────
function getUser() {
    try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}

function checkAuth() {
    const user = getUser();
    const authButtons = document.getElementById('authButtons');
    const userInfo    = document.getElementById('userInfo');
    const userHandle  = document.getElementById('userHandle');

    if (user && user.name) {
        if (authButtons) authButtons.style.display = 'none';
        if (userInfo) {
            userInfo.style.cssText = 'display:flex; align-items:center; gap:12px;';
            if (userHandle) {
                const pts = (user.role === 'citizen' && user.ecoPoints !== undefined)
                    ? `<span class="eco-badge" id="navEcoPoints">🌿 ${user.ecoPoints} pts</span>`
                    : `<span class="badge badge-purple" style="text-transform:capitalize;">${user.role}</span>`;
                userHandle.innerHTML = `
                    <span style="font-weight:600; font-size:0.9rem;">${user.name}</span>
                    ${pts}
                `;
            }
        }
        
        // Hide dashboard links for citizens
        if (user.role === 'citizen') {
            document.querySelectorAll('a[href*="dashboard.html"]').forEach(link => {
                link.style.display = 'none';
            });
        }
    } else {
        if (authButtons) authButtons.style.display = 'flex';
        if (userInfo)    userInfo.style.display = 'none';
    }
}

// Update eco-points display in navbar (call after submitting a report)
function refreshEcoPoints(newPoints) {
    const user = getUser();
    if (!user || user.role !== 'citizen') return;
    user.ecoPoints = newPoints;
    localStorage.setItem('user', JSON.stringify(user));
    const badge = document.getElementById('navEcoPoints');
    if (badge) {
        badge.textContent = `🌿 ${newPoints} pts`;
        badge.style.transform = 'scale(1.2)';
        setTimeout(() => badge.style.transform = '', 300);
    }
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(email, password) {
    try {
        const res  = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) {
            showToast(data.error || 'Login failed', 'error');
            return false;
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user',  JSON.stringify(data.user));
        localStorage.setItem('role',  data.user.role);

        // Redirect based on role — always use server-relative paths
        if (data.user.role === 'admin') {
            window.location.href = '/dashboard.html';
        } else if (data.user.role === 'driver') {
            window.location.href = '/frontend/driver.html';
        } else {
            window.location.href = '/frontend/index.html';
        }
        return true;
    } catch {
        showToast('Cannot reach server. Is it running on port 5000?', 'error');
        return false;
    }
}

// ── Logout ────────────────────────────────────────────────────────────────────
function logout() {
    localStorage.clear();
    window.location.href = '/frontend/index.html';
}

// ── Public Stats ──────────────────────────────────────────────────────────────
async function initPublicStats() {
    try {
        const res  = await fetch(`${API_URL}/public-stats`);
        if (!res.ok) return;
        const data = await res.json();
        const counters = document.querySelectorAll('.counter');
        if (counters[0]) counters[0].setAttribute('data-target', data.totalTons   || 1540);
        if (counters[1]) counters[1].setAttribute('data-target', Math.round((data.activeCitizens || 320000) / 1000));
        if (counters[2]) counters[2].setAttribute('data-target', data.co2Reduction || 45);
    } catch { /* server offline — use default values already in HTML */ }
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // ── Mobile hamburger toggle ──────────────────────────────────────────────
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks   = document.querySelector('.nav-links');
    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            const open = navLinks.classList.toggle('show');
            menuToggle.textContent = open ? '✕' : '☰';
        });
        // Close on nav link click (mobile)
        navLinks.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
                navLinks.classList.remove('show');
                menuToggle.textContent = '☰';
            });
        });
    }

    // ── Scroll reveal ────────────────────────────────────────────────────────
    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('active');
                revealObserver.unobserve(e.target);
            }
        });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // ── Counter animation ────────────────────────────────────────────────────
    const counterObserver = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        const counter = entry.target;
        const target  = +counter.getAttribute('data-target') || 0;
        const duration = 1400;
        const start    = Date.now();
        const tick = () => {
            const elapsed  = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased    = 1 - Math.pow(1 - progress, 3);
            counter.textContent = Math.floor(eased * target).toLocaleString();
            if (progress < 1) requestAnimationFrame(tick);
            else counter.textContent = target.toLocaleString();
        };
        requestAnimationFrame(tick);
        counterObserver.unobserve(counter);
    }, { threshold: 0.5 });
    document.querySelectorAll('.counter').forEach(el => counterObserver.observe(el));

    // ── Page loader ──────────────────────────────────────────────────────────
    const loader = document.getElementById('pageLoader');
    if (loader) {
        // Hide after a short delay (DOMContentLoaded is already inside this handler)
        const hideLoader = () => {
            loader.classList.add('hidden');
            setTimeout(() => { if (loader.parentNode) loader.remove(); }, 500);
        };
        // Try immediately (DOM is ready), fallback on window load
        setTimeout(hideLoader, 300);
        window.addEventListener('load', hideLoader);
    }

    // ── Auth state ───────────────────────────────────────────────────────────
    checkAuth();
    initPublicStats();

    // ── Contact form ─────────────────────────────────────────────────────────
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', async e => {
            e.preventDefault();
            const btn  = contactForm.querySelector('button[type="submit"]');
            const orig = btn.innerHTML;
            btn.innerHTML = '<span class="spinner"></span>Sending…';
            btn.disabled  = true;

            const data = {
                name:    contactForm.querySelector('[name="name"]')?.value   || '',
                email:   contactForm.querySelector('[name="email"]')?.value  || '',
                subject: contactForm.querySelector('[name="subject"]')?.value|| '',
                message: contactForm.querySelector('[name="message"]')?.value|| ''
            };

            try {
                const res = await fetch(`${API_URL}/contact`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const json = await res.json();
                if (res.ok) {
                    showToast("Message sent! We'll be in touch soon. 📬", 'success');
                    contactForm.reset();
                } else {
                    showToast(json.error || 'Failed to send message', 'error');
                }
            } catch {
                showToast('Server offline — please try again later', 'error');
            } finally {
                btn.innerHTML = orig;
                btn.disabled  = false;
            }
        });
    }

    // ── Navbar scroll style ──────────────────────────────────────────────────
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        const updateNav = () => {
            navbar.style.background = window.scrollY > 20
                ? 'rgba(11,17,32,0.96)'
                : 'rgba(11,17,32,0.88)';
        };
        window.addEventListener('scroll', updateNav, { passive: true });
        updateNav();
    }
});
