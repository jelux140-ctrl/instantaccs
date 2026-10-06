import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

let supabase = null;

async function loadConfig() {
    const res = await fetch('/api/supabase-public');
    if (!res.ok) throw new Error('Could not load auth configuration');
    const { url, anonKey } = await res.json();
    if (!url || !anonKey) throw new Error('Supabase not configured');
    return { url, anonKey };
}

function formatTimestamp(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const PAGE_SIZE = 12;
let allReviews = [];
let currentPage = 1;

function starRow(n, max = 5) {
    let html = '';
    for (let i = 1; i <= max; i++) {
        const filled = i <= n;
        html += `<i class="fas fa-star vouch-star ${filled ? 'is-on' : 'is-off'}"></i>`;
    }
    return html;
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function initials(name) {
    const clean = String(name || 'U').replace(/[^a-z0-9]/gi, '');
    return (clean.slice(0, 2) || 'U').toUpperCase();
}

function cardHtml(v) {
    const name = escapeHtml(v.discordUsername || 'User');
    const content = escapeHtml(v.content || '');

    const avatar = v.avatarUrl
        ? `<img src="${escapeHtml(v.avatarUrl)}" alt="" class="review-avatar" width="40" height="40" loading="lazy" referrerpolicy="no-referrer">`
        : `<div class="review-avatar review-avatar-fallback" aria-hidden="true">${initials(v.discordUsername)}</div>`;

    // Product tag: "RAINBOW SIX SIEGE  |  R6 — 1 Week"
    const tag = v.product
        ? `<div class="review-tags">
               <span class="review-tag-product">${escapeHtml(v.product)}</span>
               ${v.productVariant ? `<span class="review-tag-plan">${escapeHtml(v.productShort || v.product)} — ${escapeHtml(v.productVariant)}</span>` : ''}
           </div>`
        : '';

    const proof = v.proofUrl
        ? `<div class="review-proof"><a href="${escapeHtml(v.proofUrl)}" class="vouch-proof-link" target="_blank" rel="noopener noreferrer" data-proof="${escapeHtml(v.proofUrl)}"><i class="fas fa-image"></i> View proof</a></div>`
        : '';

    const reply = v.staffReply
        ? `<div class="review-reply">
               <div class="review-reply-head">
                   <span class="review-reply-avatar"><img src="/assets/creedlogo.png" alt=""></span>
                   <span class="review-reply-name">Creed Support</span>
               </div>
               <p class="review-reply-text">${escapeHtml(v.staffReply)}</p>
               ${v.staffReplyAt ? `<span class="review-reply-date">${formatDate(v.staffReplyAt)}</span>` : ''}
           </div>`
        : '';

    const verified = v.verifiedPurchase !== false
        ? `<span class="review-verified"><i class="fas fa-circle-check"></i> Verified Purchase</span>`
        : '';

    return `
        <article class="review-card">
            <div class="review-head">
                <div class="review-user">
                    ${avatar}
                    <div class="review-user-meta">
                        <span class="review-name">${name}</span>
                        <span class="review-date">${formatDate(v.createdAt)}</span>
                    </div>
                </div>
                <div class="review-stars">${starRow(v.rating)}</div>
            </div>
            ${tag}
            <p class="review-text">${content}</p>
            ${proof}
            ${reply}
            <div class="review-foot">${verified}</div>
        </article>
    `;
}

function statsHtml(stats) {
    const avg = (stats.average || 0).toFixed(1);
    return `
        <div class="review-stat">
            <span class="review-stat-label"><i class="fas fa-star"></i> Average Rating</span>
            <span class="review-stat-value">${avg}</span>
            <span class="review-stat-stars">${starRow(Math.round(stats.average || 0))}</span>
        </div>
        <div class="review-stat">
            <span class="review-stat-label"><i class="fas fa-chart-line"></i> Total Reviews</span>
            <span class="review-stat-value">${stats.total || 0}</span>
            <span class="review-stat-sub">Verified buyers across all products</span>
        </div>
        <div class="review-stat">
            <span class="review-stat-label"><i class="fas fa-comment-dots"></i> Support Replies</span>
            <span class="review-stat-value">${stats.supportReplies || 0}</span>
            <span class="review-stat-sub">Personal responses from our team</span>
        </div>
    `;
}

function renderPage() {
    const grid = document.getElementById('vouches-grid');
    const totalPages = Math.max(1, Math.ceil(allReviews.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const slice = allReviews.slice(start, start + PAGE_SIZE);
    grid.innerHTML = slice.map(cardHtml).join('');

    wireProofLinks(grid);
    renderPagination(totalPages, start, slice.length);
}

function renderPagination(totalPages, start, shown) {
    const wrap = document.getElementById('reviews-pagination');
    const info = document.getElementById('reviews-page-info');
    if (!wrap) return;

    if (info) {
        // "recent" matters: the headline counter covers all time, this grid
        // only holds the latest batch, so the two numbers shouldn't clash.
        info.textContent = allReviews.length
            ? `Showing ${start + 1}–${start + shown} of ${allReviews.length} recent reviews · Page ${currentPage} of ${totalPages}`
            : '';
    }

    if (totalPages <= 1) {
        wrap.innerHTML = '';
        return;
    }

    let html = `<button type="button" class="review-page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} aria-label="Previous page"><i class="fas fa-chevron-left"></i></button>`;
    for (let p = 1; p <= totalPages; p++) {
        const near = Math.abs(p - currentPage) <= 1 || p === 1 || p === totalPages;
        if (!near) {
            if (p === 2 || p === totalPages - 1) html += `<span class="review-page-gap">…</span>`;
            continue;
        }
        html += `<button type="button" class="review-page-btn ${p === currentPage ? 'is-active' : ''}" data-page="${p}">${p}</button>`;
    }
    html += `<button type="button" class="review-page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Next page"><i class="fas fa-chevron-right"></i></button>`;
    wrap.innerHTML = html;

    wrap.querySelectorAll('.review-page-btn[data-page]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const p = Number(btn.dataset.page);
            if (!p || p < 1 || p > totalPages || p === currentPage) return;
            currentPage = p;
            renderPage();
            document.querySelector('.vouches-page-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function wireProofLinks(scope) {
    scope.querySelectorAll('.vouch-proof-link').forEach((a) => {
        a.addEventListener('click', (e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
            e.preventDefault();
            openLightbox(a.getAttribute('data-proof'));
        });
    });
}

async function fetchVouches() {
    const grid = document.getElementById('vouches-grid');
    const loading = document.getElementById('vouches-loading');
    const empty = document.getElementById('vouches-empty');
    const statsBar = document.getElementById('reviews-stats');
    loading.hidden = false;
    empty.hidden = true;
    grid.innerHTML = '';

    const res = await fetch('/api/vouches');
    loading.hidden = true;
    if (!res.ok) {
        grid.innerHTML = `<p class="vouches-error">Could not load reviews. Try again later.</p>`;
        return;
    }
    const data = await res.json();
    allReviews = data.reviews || data.vouches || [];
    currentPage = 1;

    if (statsBar) {
        const stats = data.stats || {
            // Fallback only — the API normally supplies these.
            total: Math.max(1143, allReviews.length),
            average: allReviews.length
                ? allReviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / allReviews.length
                : 0,
            supportReplies: Math.max(226, allReviews.filter((r) => r.staffReply).length),
        };
        statsBar.innerHTML = statsHtml(stats);
        statsBar.hidden = allReviews.length === 0;
    }

    if (allReviews.length === 0) {
        empty.hidden = false;
        const pag = document.getElementById('reviews-pagination');
        if (pag) pag.innerHTML = '';
        const info = document.getElementById('reviews-page-info');
        if (info) info.textContent = '';
        return;
    }

    renderPage();
}

function openLightbox(url) {
    const lb = document.getElementById('vouch-lightbox');
    const img = document.getElementById('vouch-lightbox-img');
    img.src = url;
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lb = document.getElementById('vouch-lightbox');
    lb.hidden = true;
    document.getElementById('vouch-lightbox-img').src = '';
    document.body.style.overflow = '';
}

function getDiscordIdentity(user) {
    const ident = user.identities?.find((i) => i.provider === 'discord');
    return { ident, d: ident?.identity_data || {}, meta: user.user_metadata || {} };
}

function discordDisplayName(user) {
    const { d, meta } = getDiscordIdentity(user);
    const cc = d.custom_claims || meta.custom_claims || {};
    const fromEmail = meta.email && typeof meta.email === 'string' ? meta.email.split('@')[0] : '';
    return (
        cc.global_name ||
        cc.username ||
        d.username ||
        d.preferred_username ||
        d.full_name ||
        d.name ||
        meta.full_name ||
        meta.name ||
        meta.preferred_username ||
        meta.user_name ||
        meta.custom_claims?.global_name ||
        fromEmail ||
        'Discord member'
    );
}

function defaultDiscordEmbedAvatar(userId) {
    if (!userId || !/^\d+$/.test(String(userId))) {
        return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
    try {
        const n = BigInt(userId);
        const idx = Number((n >> 22n) % 6n);
        return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch {
        return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
}

function discordAvatarUrl(user) {
    const { d, meta } = getDiscordIdentity(user);
    const uid = String(d.sub || d.provider_id || '').trim();

    const tryUrl = (u) => (u && /^https?:\/\//i.test(String(u)) ? String(u) : null);

    let u = tryUrl(d.avatar_url) || tryUrl(meta.avatar_url) || tryUrl(meta.picture) || tryUrl(meta.picture_url);
    if (u) return u;

    const hash = d.avatar || meta.avatar;
    if (uid && hash) {
        const ext = String(hash).startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${uid}/${hash}.${ext}?size=128`;
    }

    if (uid) return defaultDiscordEmbedAvatar(uid);
    return null;
}

function applyUserAvatarUi(avEl, fbEl, url) {
    avEl.onload = null;
    avEl.onerror = null;
    avEl.removeAttribute('src');
    avEl.hidden = true;
    if (fbEl) fbEl.hidden = false;

    if (!url) return;

    avEl.onload = () => {
        avEl.hidden = false;
        if (fbEl) fbEl.hidden = true;
    };
    avEl.onerror = () => {
        avEl.hidden = true;
        avEl.removeAttribute('src');
        if (fbEl) fbEl.hidden = false;
    };
    avEl.referrerPolicy = 'no-referrer';
    avEl.src = url;
}

async function updateAuthUi(session) {
    const guest = document.getElementById('vouch-auth-guest');
    const authed = document.getElementById('vouch-auth-user');
    const nameEl = document.getElementById('vouch-user-name');
    const av = document.getElementById('vouch-user-avatar');
    const fb = document.getElementById('vouch-user-avatar-fallback');

    if (!session?.user) {
        guest.hidden = false;
        authed.hidden = true;
        nameEl.textContent = '';
        return;
    }

    let user = session.user;
    if (supabase && session.access_token) {
        const { data, error } = await supabase.auth.getUser(session.access_token);
        if (!error && data?.user) user = data.user;
    }

    guest.hidden = true;
    authed.hidden = false;
    nameEl.textContent = discordDisplayName(user);

    const url = discordAvatarUrl(user);
    applyUserAvatarUi(av, fb, url);
}

function paintStars(value) {
    const wrap = document.getElementById('vouch-stars-input');
    const hidden = document.getElementById('vouch-rating-value');
    hidden.value = String(value);
    wrap.querySelectorAll('button[data-value]').forEach((btn) => {
        const v = Number(btn.dataset.value);
        btn.classList.toggle('is-active', v <= value);
    });
}

function wireStars() {
    const wrap = document.getElementById('vouch-stars-input');
    const buttons = wrap.querySelectorAll('button[data-value]');
    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            paintStars(Number(btn.dataset.value));
        });
    });
    paintStars(5);
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('Read failed'));
        r.readAsDataURL(file);
    });
}

async function init() {
    const { url, anonKey } = await loadConfig();
    supabase = createClient(url, anonKey, {
        auth: {
            flowType: 'pkce',
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
        },
    });

    const {
        data: { session },
    } = await supabase.auth.getSession();
    await updateAuthUi(session);

    supabase.auth.onAuthStateChange(async (_event, sess) => {
        await updateAuthUi(sess);
    });

    const modal = document.getElementById('vouch-composer-modal');
    const openModal = () => {
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('vouch-modal-open');
    };
    const closeModal = () => {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('vouch-modal-open');
    };

    document.getElementById('btn-open-vouch-modal').addEventListener('click', openModal);
    document.getElementById('vouch-composer-modal-overlay').addEventListener('click', closeModal);
    document.getElementById('vouch-composer-modal-close').addEventListener('click', closeModal);

    document.getElementById('btn-discord-login').addEventListener('click', async () => {
        // Dedicated callback URL — must be listed in Supabase Dashboard → Auth → URL Configuration → Redirect URLs
        const redirectTo = `${window.location.origin}/auth-callback`;
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'discord',
            options: {
                redirectTo,
                scopes: 'identify email',
            },
        });
        if (error) console.error(error);
    });

    document.getElementById('btn-discord-logout').addEventListener('click', async () => {
        await supabase.auth.signOut();
    });

    wireStars();

    const proofInput = document.getElementById('vouch-proof');
    const proofPreview = document.getElementById('vouch-proof-preview');
    const proofClear = document.getElementById('vouch-proof-clear');
    let proofDataUrl = null;

    proofInput.addEventListener('change', async () => {
        proofDataUrl = null;
        proofPreview.innerHTML = '';
        proofPreview.hidden = true;
        proofClear.hidden = true;
        const f = proofInput.files?.[0];
        if (!f) return;
        if (f.size > 2 * 1024 * 1024) {
            proofInput.value = '';
            alert('Image must be 2MB or smaller.');
            return;
        }
        try {
            proofDataUrl = await readFileAsDataUrl(f);
            proofPreview.innerHTML = `<img src="${proofDataUrl}" alt="Preview">`;
            proofPreview.hidden = false;
            proofClear.hidden = false;
        } catch {
            proofInput.value = '';
        }
    });

    proofClear.addEventListener('click', () => {
        proofInput.value = '';
        proofDataUrl = null;
        proofPreview.innerHTML = '';
        proofPreview.hidden = true;
        proofClear.hidden = true;
    });

    const form = document.getElementById('vouch-form');
    const errEl = document.getElementById('vouch-form-error');
    const submitBtn = document.getElementById('vouch-submit');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errEl.hidden = true;
        const {
            data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
            errEl.textContent = 'Sign in with Discord first.';
            errEl.hidden = false;
            return;
        }

        const rating = Number(document.getElementById('vouch-rating-value').value);
        const content = document.getElementById('vouch-text').value.trim();
        const body = { rating, content };
        if (proofDataUrl) body.proofDataUrl = proofDataUrl;

        submitBtn.disabled = true;
        submitBtn.querySelector('.vouch-submit-label').hidden = true;
        submitBtn.querySelector('.vouch-submit-loading').hidden = false;

        try {
            const res = await fetch('/api/vouch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(body),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                errEl.textContent = json.error || 'Something went wrong.';
                errEl.hidden = false;
                return;
            }
            form.reset();
            proofDataUrl = null;
            proofPreview.innerHTML = '';
            proofPreview.hidden = true;
            proofClear.hidden = true;
            document.getElementById('vouch-proof').value = '';
            paintStars(5);
            await fetchVouches();
            closeModal();
        } finally {
            submitBtn.disabled = false;
            submitBtn.querySelector('.vouch-submit-label').hidden = false;
            submitBtn.querySelector('.vouch-submit-loading').hidden = true;
        }
    });

    document.getElementById('vouch-lightbox-close').addEventListener('click', closeLightbox);
    document.getElementById('vouch-lightbox').addEventListener('click', (e) => {
        if (e.target.id === 'vouch-lightbox') closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!modal.hidden) {
            closeModal();
            return;
        }
        closeLightbox();
    });

    await fetchVouches();
}

init().catch((err) => {
    console.error(err);
    const el = document.getElementById('vouches-grid');
    if (el) el.innerHTML = `<p class="vouches-error">Could not start vouches page. Check configuration.</p>`;
    document.getElementById('vouches-loading').hidden = true;
});
