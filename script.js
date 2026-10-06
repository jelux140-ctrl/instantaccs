/* =========================================
   CREED - ADVANCED INTERACTIVITY
   ========================================= */

(function restoreNativeCursor() {
    var s = document.createElement('style');
    s.setAttribute('data-creed-cursor', 'native');
    s.textContent = 'html,body{cursor:default!important}*,*::before,*::after{cursor:inherit}a,button,[role="button"],.icon-btn,.btn,label,select,summary,.faq-header,.filter-btn{cursor:pointer!important}input,textarea{cursor:text!important}#cursor,#cursor-blur{display:none!important}';
    (document.head || document.documentElement).appendChild(s);
})();

/* Hosted Umami — production only. Never localhost. */
(function loadUmami() {
    try {
        if (document.querySelector('script[data-website-id]')) return;
        var s = document.createElement('script');
        s.defer = true;
        s.src = 'https://analytics.stavlux.com/script.js';
        s.setAttribute('data-website-id', 'de7c8b17-d62d-4d70-af5e-5dd4e68bf7eb');
        s.setAttribute('data-host-url', 'https://analytics.stavlux.com');
        s.setAttribute('data-domains', 'creedv2.com,www.creedv2.com');
        document.head.appendChild(s);
    } catch (e) { /* never break the page over analytics */ }
})();

window.creedCustomerId = function () {
    try {
        var id = localStorage.getItem('creed_customer_id');
        if (!id) {
            id = (window.crypto && crypto.randomUUID)
                ? crypto.randomUUID()
                : ('c' + Date.now().toString(16) + Math.random().toString(16).slice(2, 10));
            if (id.length > 50) id = id.slice(0, 50);
            localStorage.setItem('creed_customer_id', id);
        }
        return id;
    } catch (e) {
        return '';
    }
};

function creedIdentify(extra) {
    try {
        var id = window.creedCustomerId();
        if (id && window.umami && typeof window.umami.identify === 'function') {
            if (extra && extra.email) {
                window.umami.identify(id, { email: extra.email });
            } else {
                window.umami.identify(id);
            }
        }
    } catch (e) { /* ignore */ }
}

(function identifyWhenReady() {
    var tries = 0;
    var timer = setInterval(function () {
        tries += 1;
        if (window.umami && typeof window.umami.identify === 'function') {
            creedIdentify();
            clearInterval(timer);
        } else if (tries > 20) {
            clearInterval(timer);
        }
    }, 250);
})();

window.creedTrack = function (name, data) {
    try {
        var payload = Object.assign({ customer: window.creedCustomerId() }, data || {});
        var send = function () {
            if (window.umami && typeof window.umami.track === 'function') {
                creedIdentify(payload.email ? { email: payload.email } : undefined);
                window.umami.track(name, payload);
                return true;
            }
            return false;
        };
        if (send()) return;
        var tries = 0;
        var timer = setInterval(function () {
            tries += 1;
            if (send() || tries > 20) {
                clearInterval(timer);
            }
        }, 250);
    } catch (e) { /* never break the page over analytics */ }
};

window.CREED_ANALYTICS = {
    url: 'https://analytics.stavlux.com',
    websiteId: 'de7c8b17-d62d-4d70-af5e-5dd4e68bf7eb'
};

window.creedValidateCampaign = function (type, code) {
    var analytics = window.CREED_ANALYTICS || {};
    var normalized = String(code || '').trim();
    if (!normalized || !analytics.url || !analytics.websiteId) {
        return Promise.resolve({ valid: false });
    }
    var url = analytics.url + '/api/campaigns/validate?websiteId=' +
        encodeURIComponent(analytics.websiteId) +
        '&type=' + encodeURIComponent(type) +
        '&code=' + encodeURIComponent(normalized);
    return fetch(url)
        .then(function (res) { return res.json(); })
        .catch(function () { return { valid: false }; });
};

window.creedValidateDiscount = function (code) {
    return window.creedValidateCampaign('discount', code).then(function (data) {
        if (data && data.valid) {
            return { valid: true, percent: Number(data.percent) || 0, code: data.code };
        }
        return { valid: false, percent: 0 };
    });
};

window.creedSaveEmail = function (payload) {
    var analytics = window.CREED_ANALYTICS || {};
    var email = String((payload && payload.email) || '').trim().toLowerCase();
    if (!email || !analytics.url || !analytics.websiteId) {
        return Promise.resolve({ success: false });
    }
    return fetch(analytics.url + '/api/campaigns/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            websiteId: analytics.websiteId,
            email: email,
            kind: (payload && payload.kind) || 'promo',
            source: (payload && payload.source) || '',
            customerId: (payload && payload.customerId) || (typeof window.creedCustomerId === 'function' ? window.creedCustomerId() : ''),
            orderId: (payload && payload.orderId) || ''
        })
    }).then(function (res) { return res.json(); }).catch(function () { return { success: false }; });
};

window.creedSaveOrder = function (payload) {
    var analytics = window.CREED_ANALYTICS || {};
    var orderId = String((payload && (payload.orderId || payload.id)) || '').trim();
    if (!orderId || !analytics.url || !analytics.websiteId) {
        return Promise.resolve({ success: false });
    }
    return fetch(analytics.url + '/api/campaigns/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            websiteId: analytics.websiteId,
            orderId: orderId,
            email: String((payload && payload.email) || '').trim().toLowerCase(),
            status: (payload && payload.status) || 'pending',
            amount: (payload && payload.amount) || 0,
            currency: (payload && payload.currency) || 'USD',
            paymentMethod: (payload && payload.paymentMethod) || '',
            sessionId: (payload && payload.sessionId) || '',
            items: (payload && payload.items) || [],
            paidAt: (payload && payload.paidAt) || '',
            createdAt: (payload && payload.createdAt) || ''
        })
    }).then(function (res) { return res.json(); }).catch(function () { return { success: false }; });
};

(function trackTimeOnSite() {
    try {
        var KEY = 'creed_time_on_site_sec';
        var last = Date.now();
        setInterval(function () {
            if (document.hidden) {
                last = Date.now();
                return;
            }
            var prev = Number(localStorage.getItem(KEY) || 0) || 0;
            var add = Math.round((Date.now() - last) / 1000);
            last = Date.now();
            if (add > 0 && add < 30) localStorage.setItem(KEY, String(prev + add));
        }, 5000);
    } catch (e) { /* ignore */ }
})();

(function trackEmailCampaignLanding() {
    try {
        var params = new URLSearchParams(window.location.search);
        var medium = String(params.get('utm_medium') || '').toLowerCase();
        var campaign = String(params.get('utm_campaign') || '').trim();
        if (medium !== 'email' || !campaign) return;
        try {
            localStorage.setItem('creed_email_campaign', JSON.stringify({
                campaign: campaign,
                source: params.get('utm_source') || 'email',
                ts: Date.now()
            }));
        } catch (e) { /* storage disabled */ }
        var flag = 'creed_email_click_' + campaign;
        if (sessionStorage.getItem(flag)) return;
        sessionStorage.setItem(flag, '1');
        if (typeof window.creedTrack === 'function') {
            window.creedTrack('email_click', {
                campaign: campaign,
                source: params.get('utm_source') || 'email'
            });
        }
    } catch (e) { /* ignore */ }
})();

/* Make the shared navbar brand a real homepage link on every page. Some
   templates still render it as a div, so normalize the markup at startup. */
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.navbar .logo').forEach(function (logo) {
        if (logo.tagName === 'A') {
            logo.setAttribute('href', '/');
            logo.setAttribute('aria-label', 'Creed home');
            return;
        }

        var link = document.createElement('a');
        link.className = logo.className;
        link.href = '/';
        link.setAttribute('aria-label', 'Creed home');
        while (logo.firstChild) link.appendChild(logo.firstChild);
        logo.replaceWith(link);
    });
});

/* --- Start fresh page loads at the top -----------------------------------
   Following a footer link could land you part-way down the next page instead
   of at its start. Safari in particular carries the outgoing page's scroll
   offset across a link click, and with the footer ~12,000px down that drops
   you into the middle of a product page.

   Only fresh navigations are reset. back_forward and reload keep whatever the
   browser restored, and scrollRestoration is handed back to 'auto' once we are
   done so returning here via the back button still restores your place. */
(function startAtTop() {
    var nav = null;
    try {
        nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || null;
    } catch (e) { /* older browsers: fall through and treat as a fresh load */ }

    var type = nav && nav.type ? nav.type : 'navigate';
    if (type !== 'navigate') return;
    if (window.location.hash) return; // honour deep links like /products#catalog

    var canControl = 'scrollRestoration' in history;
    if (canControl) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    window.addEventListener('load', function () {
        window.scrollTo(0, 0);
        if (canControl) history.scrollRestoration = 'auto';
    });
})();

/* --- Referral / affiliate capture ---------------------------------------
   Reads ?ref=CODE (also ?aff= / ?a=) from the landing URL, remembers it for
   30 days, and pings the backend so we can count visitors per affiliate.
   The stored code is later attached to the order at checkout (see cart.js). */
(function captureReferral() {
    var REF_KEY = 'creed_ref';
    var WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days attribution window

    function normalize(v) {
        return String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    }

    try {
        var params = new URLSearchParams(window.location.search);
        var raw = params.get('ref') || params.get('aff') || params.get('a');
        var code = normalize(raw);
        if (!code) return;

        // Persist for later checkout attribution
        try {
            localStorage.setItem(REF_KEY, JSON.stringify({ code: code, ts: Date.now() }));
        } catch (e) { /* storage disabled */ }

        // Count this visit once per browser session per code
        var sessionFlag = 'creed_ref_seen_' + code;
        if (sessionStorage.getItem(sessionFlag)) return;
        sessionStorage.setItem(sessionFlag, '1');
        if (typeof window.creedTrack === 'function') {
            window.creedTrack('referral', { code: code });
        }

        var payload = JSON.stringify({
            code: code,
            landingPath: window.location.pathname + window.location.search,
            referrer: document.referrer || ''
        });

        if (navigator.sendBeacon) {
            navigator.sendBeacon('/api/referral-track', new Blob([payload], { type: 'application/json' }));
        } else {
            fetch('/api/referral-track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true
            }).catch(function () {});
        }
    } catch (e) { /* never break the page over analytics */ }
})();

// Expose the active referral code (within the attribution window) to other scripts
window.getCreedEmailCampaign = function () {
    try {
        var stored = JSON.parse(localStorage.getItem('creed_email_campaign') || 'null');
        if (!stored || !stored.campaign) return null;
        if (Date.now() - (stored.ts || 0) > 30 * 24 * 60 * 60 * 1000) {
            localStorage.removeItem('creed_email_campaign');
            return null;
        }
        return stored.campaign;
    } catch (e) {
        return null;
    }
};

window.getCreedReferral = function () {
    try {
        var stored = JSON.parse(localStorage.getItem('creed_ref') || 'null');
        if (!stored || !stored.code) return null;
        if (Date.now() - (stored.ts || 0) > 30 * 24 * 60 * 60 * 1000) {
            localStorage.removeItem('creed_ref');
            return null;
        }
        return stored.code;
    } catch (e) { return null; }
};

(function captureVideoTags() {
    var WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

    function slug(v) {
        return String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
    }

    function readStored(key) {
        try {
            var stored = JSON.parse(localStorage.getItem(key) || 'null');
            if (!stored || !stored.video) return '';
            if (Date.now() - (stored.ts || 0) > WINDOW_MS) {
                localStorage.removeItem(key);
                return '';
            }
            return stored.video;
        } catch (e) {
            return '';
        }
    }

    function save(platform, video) {
        var key = platform === 'youtube' ? 'creed_yt' : 'creed_tt';
        try {
            localStorage.setItem(key, JSON.stringify({ video: video, ts: Date.now() }));
        } catch (e) { /* ignore */ }
        var flag = 'creed_' + platform + '_seen_' + video;
        if (sessionStorage.getItem(flag)) return;
        sessionStorage.setItem(flag, '1');
        if (typeof window.creedTrack === 'function') {
            window.creedTrack(platform, { video: video });
        }
    }

    window.getCreedYoutube = function () { return readStored('creed_yt'); };
    window.getCreedTiktok = function () { return readStored('creed_tt'); };

    try {
        var params = new URLSearchParams(window.location.search);
        var yt = slug(params.get('yt'));
        var tt = slug(params.get('tt'));
        if (yt) save('youtube', yt);
        if (tt) save('tiktok', tt);
    } catch (e) { /* ignore */ }
})();

document.addEventListener('DOMContentLoaded', () => {
    // Give the storefront a clear entry point to customer accounts without
    // coupling authentication to checkout. Guest checkout remains unchanged.
    document.querySelectorAll('.nav-icons').forEach((navIcons) => {
        if (navIcons.querySelector('.account-nav-button')) return;
        const accountLink = document.createElement('a');
        accountLink.href = '/account';
        accountLink.className = 'account-nav-button';
        accountLink.setAttribute('aria-label', 'Open your Creed account');
        accountLink.innerHTML = '<i class="fas fa-user"></i><span>Account</span>';
        const cart = navIcons.querySelector('#cart-icon');
        navIcons.insertBefore(accountLink, cart || navIcons.firstChild);
    });

    document.querySelectorAll('.mobile-menu-content').forEach((menu) => {
        if (menu.querySelector('.mobile-account-link')) return;
        const accountLink = document.createElement('a');
        accountLink.href = '/account';
        accountLink.className = 'mobile-menu-link mobile-account-link';
        accountLink.innerHTML = '<i class="fas fa-user"></i><span>Account</span>';
        const discord = menu.querySelector('.mobile-menu-discord');
        menu.insertBefore(accountLink, discord || null);
    });


    // Static honeycomb texture (no per-frame mouse tracking — that was the lag)
    const canvas = document.getElementById('bg-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        const hexSize = 30;

        function drawHexGrid() {
            const width = canvas.width = window.innerWidth;
            const height = canvas.height = window.innerHeight;
            ctx.clearRect(0, 0, width, height);
            const rowHeight = hexSize * 1.5;
            const colWidth = hexSize * Math.sqrt(3);
            const rows = Math.ceil(height / rowHeight) + 1;
            const cols = Math.ceil(width / colWidth) + 1;
            ctx.strokeStyle = 'rgba(255, 107, 53, 0.05)';
            ctx.lineWidth = 2;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    let x = c * colWidth;
                    const y = r * rowHeight;
                    if (r % 2 === 1) x += colWidth / 2;
                    ctx.beginPath();
                    for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI / 3) * i;
                        const px = x + hexSize * Math.cos(angle);
                        const py = y + hexSize * Math.sin(angle);
                        if (i === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            }
        }

        drawHexGrid();
        window.addEventListener('resize', drawHexGrid);
    }


    // --- Footer newsletter: reuses the promo-code endpoint the popup uses ---
    const newsletter = document.getElementById('footer-newsletter');
    if (newsletter) {
        newsletter.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = newsletter.querySelector('input[name="email"]');
            const btn = newsletter.querySelector('button');
            const msg = document.getElementById('footer-newsletter-msg');
            const email = (input.value || '').trim();

            const show = (text, isError) => {
                if (!msg) return;
                msg.textContent = text;
                msg.classList.toggle('is-error', !!isError);
                msg.hidden = false;
            };

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                show('Please enter a valid email address.', true);
                return;
            }

            const original = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Sending…';

            try {
                if (typeof window.creedTrack === 'function') {
                    window.creedTrack('email_signup', {
                        campaign: 'bonus-signup',
                        email: email,
                        discount: 'CREED5'
                    });
                }
                if (typeof window.creedSaveEmail === 'function') {
                    await window.creedSaveEmail({ kind: 'promo', email: email, source: 'newsletter' });
                }
                await fetch('/api/send-promo-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                // The code is shown regardless — delivery is best-effort.
                show('You’re in. Use code CREED5 for 5% off your first order.');
                newsletter.reset();
            } catch (err) {
                show('You’re in. Use code CREED5 for 5% off your first order.');
                newsletter.reset();
            } finally {
                btn.disabled = false;
                btn.textContent = original;
            }
        });
    }

    // --- Product feature cards: show how many features each category has ---
    document.querySelectorAll('.feature-category, .ua-card').forEach((card) => {
        const title = card.querySelector('.feature-category-title') || card.querySelector('.ua-card-head h3');
        const count = card.querySelectorAll('.feature-list li, .ua-list li').length;
        if (!title || !count || title.querySelector('.feature-count')) return;
        const pill = document.createElement('span');
        pill.className = 'feature-count';
        pill.textContent = count;
        title.appendChild(pill);
    });

    // --- 3. Existing Logic (FAQ, Scroll) ---
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        // Whole header is clickable; fall back to the question text if there's no header
        const trigger = item.querySelector('.faq-header') || item.querySelector('.faq-question');
        if (!trigger) return;
        trigger.addEventListener('click', () => {
            faqItems.forEach(otherItem => {
                if (otherItem !== item) otherItem.classList.remove('active');
            });
            item.classList.toggle('active');
        });
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });

    const animatedElements = document.querySelectorAll('.fade-in');

    // Safety check: if no elements found, it might mean DOM loaded weirdly, but usually this is fine.
    // If we want to be extra safe against the glitching issue, we can force visible on load after a timeout if they aren't somehow.
    // But the IntersectionObserver is the standard way.

    animatedElements.forEach(el => observer.observe(el));

    // Navbar Scroll - Transparent at top, solid when scrolling
    const header = document.querySelector('header');
    if (header) {
        // Check initial scroll position
        if (window.scrollY > 30) {
            header.classList.add('scrolled');
        }
        
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    if (window.scrollY > 30) {
                        header.classList.add('scrolled');
                    } else {
                        header.classList.remove('scrolled');
                    }
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    // --- Mobile Hamburger Menu ---
    const hamburgerMenu = document.getElementById('hamburger-menu');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (hamburgerMenu && mobileMenu) {
        console.log('Hamburger menu elements found', hamburgerMenu, mobileMenu);
        
        // Use touchstart for mobile devices
        hamburgerMenu.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Hamburger clicked');
            console.log('Current classes:', hamburgerMenu.className, mobileMenu.className);
            
            hamburgerMenu.classList.toggle('active');
            mobileMenu.classList.toggle('active');
            
            console.log('After toggle - hamburger:', hamburgerMenu.classList.contains('active'));
            console.log('After toggle - menu:', mobileMenu.classList.contains('active'));
            console.log('Menu computed style:', window.getComputedStyle(mobileMenu).display);
            console.log('Menu transform:', window.getComputedStyle(mobileMenu).transform);
            
            if (mobileMenu.classList.contains('active')) {
                document.body.style.overflow = 'hidden';
                console.log('Menu opened');
            } else {
                document.body.style.overflow = '';
                console.log('Menu closed');
            }
        }, { passive: false });
        
        hamburgerMenu.addEventListener('touchstart', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Hamburger touched');
            
            hamburgerMenu.classList.toggle('active');
            mobileMenu.classList.toggle('active');
            
            if (mobileMenu.classList.contains('active')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        }, { passive: false });

        const mobileMenuLinks = document.querySelectorAll('.mobile-menu-link');
        
        // Close menu when clicking on a link
        mobileMenuLinks.forEach(link => {
            link.addEventListener('click', () => {
                hamburgerMenu.classList.remove('active');
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            });
        });

        // Close menu when clicking outside
        mobileMenu.addEventListener('click', (e) => {
            if (e.target === mobileMenu) {
                hamburgerMenu.classList.remove('active');
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        });

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
                hamburgerMenu.classList.remove('active');
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    } else {
        console.log('Hamburger menu elements not found', { hamburgerMenu, mobileMenu });
    }
});


/* =========================================
   CREED - SOCIAL PROOF
   Live "online" badge in the nav + rolling
   "someone just purchased" popups.
   ========================================= */
(function creedSocialProof() {
    if (window.__creedSocialProof) return;
    window.__creedSocialProof = true;

    // Don't show the purchase popups on payment result pages
    var quietPage = /\/(payment-success|payment-failed)/.test(location.pathname);

    // --- Product pool (only currently-sold products; must match products.html) ---
    // Each product carries its own realistic variant list — never mix products' variants.
    var PRODUCTS = [
        { name: 'Fortnite', img: '/assets/fortnitepublic.png', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
        { name: 'Valorant', img: '/assets/valorantproduct.png', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
        { name: 'Rust', img: '/assets/rustproduct.png', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
        { name: 'Apex Legends', img: '/assets/apexproduct.png', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
        { name: 'Rainbow Six Siege', img: '/assets/rainbow6product.png', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
        { name: 'COD Black Ops 7', img: '/assets/callofdutyproduct.png', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
        { name: 'Arc Raiders', img: '/assets/arcaraidersproduct.png', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
        { name: 'Temp Spoofer', img: '/assets/tempspoofer.png', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
        { name: 'Perm Spoofer', img: '/assets/permspoofer.png', variants: ['One-Time Usage', 'Lifetime Usage'] },
        { name: 'Universal Aim', img: '/assets/universalaim-product.png', variants: ['1 Day', '1 Week', '1 Month', 'Lifetime'] },
        // Accounts are a one-off purchase, so they only ever have the single variant.
        { name: 'Fortnite Skin Account', img: '/assets/fortniteskins-product.png', variants: ['Account'] },
        { name: 'Valorant Skin Account', img: '/assets/valorantskins-product.png', variants: ['Account'] },
        { name: 'Apex Legends Skin Account', img: '/assets/apexskins-product.png', variants: ['Account'] },
        { name: 'Rainbow Six Skin Account', img: '/assets/rainbowsixskins-product.png', variants: ['Account'] },
        { name: 'Warzone Skin Account', img: '/assets/warzoneskins-product.png', variants: ['Account'] }
    ];

    function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function pick(arr) { return arr[rand(0, arr.length - 1)]; }

    // --- Styles ---
    var css = ''
        + '.creed-online-badge{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;'
        + 'border:1px solid rgba(46,204,113,0.35);background:rgba(46,204,113,0.10);border-radius:999px;'
        + 'font-size:12px;font-weight:700;letter-spacing:0.4px;color:#39d98a;white-space:nowrap;'
        + 'font-family:inherit;line-height:1;margin-right:4px;}'
        + '.creed-online-badge .cob-dot{width:8px;height:8px;border-radius:50%;background:#2ecc71;'
        + 'box-shadow:0 0 0 rgba(46,204,113,0.6);animation:cobPulse 2s infinite;}'
        + '.creed-online-badge .cob-num{color:#eafff3;}'
        + '@keyframes cobPulse{0%{box-shadow:0 0 0 0 rgba(46,204,113,0.5);}70%{box-shadow:0 0 0 7px rgba(46,204,113,0);}100%{box-shadow:0 0 0 0 rgba(46,204,113,0);}}'
        + '.creed-online-badge .cob-num{display:inline-block;}'
        + '.creed-online-badge .cob-bump{animation:cobBump .45s ease;}'
        + '@keyframes cobBump{0%{transform:translateY(0);opacity:.55;}40%{transform:translateY(-2px);opacity:1;}100%{transform:translateY(0);}}'
        + '@media (max-width:520px){.creed-online-badge .cob-label{display:none;}}'
        + '#creed-sp-stack{position:fixed;left:18px;bottom:84px;z-index:100003;display:flex;flex-direction:column;gap:10px;'
        + 'pointer-events:none;max-width:340px;}'
        + '@media (max-width:768px){#creed-sp-stack{bottom:72px;left:12px;max-width:calc(100vw - 24px);}}'
        + '.creed-sp-toast{display:flex;align-items:center;gap:12px;padding:12px 14px;'
        + 'background:linear-gradient(180deg,#12161d 0%,#0c0f14 100%);border:1px solid rgba(255,255,255,0.09);'
        + 'border-radius:14px;box-shadow:0 12px 34px rgba(0,0,0,0.55);pointer-events:auto;'
        + 'transform:translateX(-120%);opacity:0;transition:transform .45s cubic-bezier(.2,.9,.25,1),opacity .45s;}'
        + '.creed-sp-toast.show{transform:translateX(0);opacity:1;}'
        + '.creed-sp-thumb{width:46px;height:46px;border-radius:10px;flex:0 0 auto;overflow:hidden;'
        + 'background:#1b2028;border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;}'
        + '.creed-sp-thumb img{width:100%;height:100%;object-fit:cover;}'
        + '.creed-sp-body{min-width:0;flex:1;}'
        + '.creed-sp-label{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:800;letter-spacing:0.7px;'
        + 'text-transform:uppercase;color:#FFB800;margin-bottom:3px;}'
        + '.creed-sp-label .dot{width:6px;height:6px;border-radius:50%;background:#FFB800;}'
        + '.creed-sp-title{font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
        + '.creed-sp-time{font-size:11px;color:#8a93a0;margin-top:2px;}'
        + '.creed-sp-cart{flex:0 0 auto;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;'
        + 'background:rgba(255,184,0,0.12);color:#FFB800;}'
        + '.creed-sp-cart svg{width:18px;height:18px;}';
    var styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    // --- Live online badge ---
    function initOnlineBadge() {
        var icons = document.querySelector('.nav-icons');
        if (!icons || document.querySelector('.creed-online-badge')) return;

        /* The count used to start anywhere in 14-42 and then random-walk by
           +/-3 with only 12 and 58 as limits, so over a few minutes it could
           swing from 12 to 30+. Instead it now sits on a baseline that only
           moves with the time of day, and wanders no more than +/-3 around it. */
        var SPREAD = 3;

        // Quiet in the morning, busiest late evening.
        function baselineNow() {
            var now = new Date();
            var h = now.getHours() + now.getMinutes() / 60;
            return Math.round(27 + 8 * Math.cos(((h - 21) / 24) * Math.PI * 2));
        }

        // Offset is what drifts; keeping it (not the total) means the number
        // stays consistent as you move between pages.
        var offset = parseInt(sessionStorage.getItem('creed_online_offset'), 10);
        if (!isFinite(offset) || Math.abs(offset) > SPREAD) offset = rand(-1, 1);

        var count = baselineNow() + offset;

        var badge = document.createElement('div');
        badge.className = 'creed-online-badge';
        badge.innerHTML = '<span class="cob-dot"></span><span class="cob-num">' + count + '</span>'
            + '<span class="cob-label">ONLINE</span>';
        icons.insertBefore(badge, icons.firstChild);

        var numEl = badge.querySelector('.cob-num');

        function drift() {
            // Step by one, and pull back toward the baseline as we near the edge
            // so it hovers instead of running away.
            var step = rand(0, 1) ? 1 : -1;
            if (Math.abs(offset + step) > SPREAD) step = -step;
            if (Math.abs(offset) === SPREAD) step = offset > 0 ? -1 : 1;
            offset += step;

            var next = baselineNow() + offset;
            if (next !== count) {
                count = next;
                numEl.textContent = count;
                numEl.classList.remove('cob-bump');
                void numEl.offsetWidth;
                numEl.classList.add('cob-bump');
            }
            sessionStorage.setItem('creed_online_offset', String(offset));
            setTimeout(drift, rand(9000, 18000));
        }
        setTimeout(drift, rand(7000, 12000));
    }

    // Shuffled queue so every product shows before any repeats
    var productQueue = [];
    function nextProduct() {
        if (productQueue.length === 0) {
            productQueue = PRODUCTS.slice();
            for (var i = productQueue.length - 1; i > 0; i--) {
                var j = rand(0, i);
                var tmp = productQueue[i];
                productQueue[i] = productQueue[j];
                productQueue[j] = tmp;
            }
        }
        return productQueue.pop();
    }

    // --- Purchase popups ---
    var CART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        + 'stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle>'
        + '<circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>';

    function timeAgo() {
        var m = rand(1, 58);
        if (m <= 1) return 'Just now';
        return m + ' minutes ago';
    }

    function showToast() {
        var stack = document.getElementById('creed-sp-stack');
        if (!stack) return;

        var product = nextProduct();
        var toast = document.createElement('div');
        toast.className = 'creed-sp-toast';
        toast.innerHTML =
            '<div class="creed-sp-thumb"><img src="' + product.img + '" alt="" loading="lazy"'
            + ' onerror="this.style.display=\'none\'"></div>'
            + '<div class="creed-sp-body">'
            + '<div class="creed-sp-label"><span class="dot"></span> Someone just purchased</div>'
            + '<div class="creed-sp-title">' + product.name + ' — ' + pick(product.variants) + '</div>'
            + '<div class="creed-sp-time">' + timeAgo() + '</div>'
            + '</div>'
            + '<div class="creed-sp-cart">' + CART_SVG + '</div>';

        stack.appendChild(toast);
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { toast.classList.add('show'); });
        });

        setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () { toast.remove(); }, 500);
        }, 6500);
    }

    function scheduleToasts() {
        function loop() {
            showToast();
            setTimeout(loop, rand(28000, 70000));
        }
        setTimeout(loop, rand(7000, 12000));
    }

    function start() {
        initOnlineBadge();
        if (quietPage) return;
        var stack = document.getElementById('creed-sp-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'creed-sp-stack';
            document.body.appendChild(stack);
        }
        scheduleToasts();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();

/* --- Live order counter --------------------------------------------------
   The "Orders Completed" figure was a hardcoded number, so a returning visitor
   saw the exact same total every time and the store looked dormant.

   The value is derived from elapsed time rather than stored anywhere, so it is
   consistent for every visitor, never runs backwards, and keeps climbing on its
   own. At the default rate it advances roughly once an hour, which is visible
   week to week without looking like a fake ticker spinning in front of you. */
/* Canonical order total. Anything that quotes a "customers served" figure must
   read it from here — the cart modal used to hardcode "7,700+" while the hero
   counter climbed past 7,800, so the two disagreed on the same page. */
window.CREED_ORDERS = { base: 7726, perDay: 28, since: '2026-08-06' };

window.creedOrdersCompleted = function () {
    var c = window.CREED_ORDERS;
    var since = Date.parse(c.since + 'T00:00:00Z');
    var elapsedDays = (Date.now() - since) / 86400000;
    if (!isFinite(elapsedDays) || elapsedDays < 0) elapsedDays = 0;
    return c.base + Math.floor(elapsedDays * c.perDay);
};

(function liveOrderCounter() {
    var DAY_MS = 24 * 60 * 60 * 1000;

    function targetFor(el) {
        // Markup may override the defaults; otherwise the shared config wins.
        var base = parseInt(el.getAttribute('data-base'), 10);
        var perDay = parseFloat(el.getAttribute('data-per-day'));
        var sinceAttr = el.getAttribute('data-since');
        if (!isFinite(base)) base = window.CREED_ORDERS.base;
        if (!isFinite(perDay)) perDay = window.CREED_ORDERS.perDay;
        var since = Date.parse((sinceAttr || window.CREED_ORDERS.since) + 'T00:00:00Z');
        if (!isFinite(since)) return null;

        var elapsedDays = (Date.now() - since) / DAY_MS;
        if (elapsedDays < 0) elapsedDays = 0; // clock skew / date not yet reached
        return base + Math.floor(elapsedDays * perDay);
    }

    function render(el, value) {
        el.textContent = value.toLocaleString('en-US');
    }

    /* Count up to the current figure once, when it first scrolls into view. */
    function animateTo(el, value) {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            render(el, value);
            return;
        }
        var from = Math.max(0, value - Math.min(120, Math.round(value * 0.02)));
        var start = null;
        var DURATION = 1400;

        function step(ts) {
            if (start === null) start = ts;
            var p = Math.min(1, (ts - start) / DURATION);
            var eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
            render(el, Math.round(from + (value - from) * eased));
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-live-count]'));
    if (!nodes.length) return;

    nodes.forEach(function (el) {
        var value = targetFor(el);
        if (value === null) return; // leave the markup's fallback text alone

        render(el, value);

        if (typeof IntersectionObserver === 'function') {
            var seen = false;
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting || seen) return;
                    seen = true;
                    animateTo(el, targetFor(el));
                    io.disconnect();
                });
            }, { threshold: 0.4 });
            io.observe(el);
        }

        // Pick up the next increment for anyone who leaves the page open.
        setInterval(function () {
            var next = targetFor(el);
            if (next !== null && next > parseInt(el.textContent.replace(/,/g, ''), 10)) {
                render(el, next);
            }
        }, 60000);
    });
})();
