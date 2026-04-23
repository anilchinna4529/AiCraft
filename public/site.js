/* =============================================================
   AICraft — Shared site behaviours
   - Navbar scroll shadow
   - Mobile hamburger
   - Theme toggle (persists in localStorage)
   - IntersectionObserver scroll reveals
   - Toast utility
   - Small fetch wrapper (api())
   ============================================================= */
(function () {
  'use strict';

  /* ---------------- Theme ---------------- */
  const THEME_KEY = 'aicraft-theme';
  const storedTheme = localStorage.getItem(THEME_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', storedTheme);
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    syncThemeIcons(next);
  }
  function syncThemeIcons(theme) {
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      const icon = btn.querySelector('i');
      if (!icon) return;
      icon.className = theme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
    });
  }

  /* ---------------- Navbar ---------------- */
  function initNavbar() {
    const nav = document.querySelector('.navbar, nav.navbar, [data-navbar]');
    if (!nav) return;

    const onScroll = () => {
      if (window.scrollY > 12) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Mobile hamburger
    const toggleBtn = nav.querySelector('[data-nav-toggle], .nav-toggle, .hamburger');
    const menu = nav.querySelector('[data-nav-menu], .nav-menu, .nav-links');
    if (toggleBtn && menu) {
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        menu.classList.toggle('mobile-open');
        toggleBtn.classList.toggle('is-active');
        toggleBtn.setAttribute('aria-expanded', menu.classList.contains('mobile-open'));
      });
      // Close on nav link click (mobile)
      menu.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          menu.classList.remove('mobile-open');
          toggleBtn.classList.remove('is-active');
        });
      });
    }
  }

  /* ---------------- Theme toggle wiring ---------------- */
  function initThemeToggle() {
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleTheme();
      });
    });
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    syncThemeIcons(current);
  }

  /* ---------------- Reveal on scroll ---------------- */
  function initReveal() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  }

  /* ---------------- Toast ---------------- */
  let toastContainer;
  function getToastContainer() {
    if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainer);
    return toastContainer;
  }
  function toast(message, type = 'info', duration = 4000) {
    const c = getToastContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const iconMap = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };
    el.innerHTML = `
      <i class="fas ${iconMap[type] || iconMap.info}"></i>
      <span class="toast-message">${escapeHtml(String(message))}</span>
      <button class="toast-close" aria-label="Close"><i class="fas fa-times"></i></button>
    `;
    c.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const close = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    };
    el.querySelector('.toast-close').addEventListener('click', close);
    if (duration > 0) setTimeout(close, duration);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---------------- Fetch wrapper ---------------- */
  async function api(path, options = {}) {
    const opts = {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    };
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, opts);
    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text().catch(() => null);
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || (data && data.message) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /* ---------------- Current year (footer) ---------------- */
  function initYear() {
    document.querySelectorAll('[data-year]').forEach(el => {
      el.textContent = new Date().getFullYear();
    });
  }

  /* ---------------- Active nav link ---------------- */
  function initActiveNav() {
    const path = location.pathname.replace(/\/$/, '') || '/index.html';
    document.querySelectorAll('.nav-links a, [data-nav-menu] a').forEach(a => {
      const href = (a.getAttribute('href') || '').replace(/\/$/, '');
      if (!href) return;
      if (href === path || (path === '/' && href.endsWith('index.html')) || (href.endsWith('index.html') && (path === '/' || path === ''))) {
        a.classList.add('active');
      }
    });
  }

  /* ---------------- Init ---------------- */
  function init() {
    initNavbar();
    initThemeToggle();
    initReveal();
    initYear();
    initActiveNav();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ---------------- Expose ---------------- */
  window.AICraft = Object.assign(window.AICraft || {}, {
    toast,
    api,
    toggleTheme
  });
})();
