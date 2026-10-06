/* Creed — portal: Discord-style channels + staff inbox */
(function () {
    const STORAGE_KEY = 'creed_portal_token';
    const STAFF_KEY = 'creed_portal_staff_token';

    const CHANNEL_TITLES = {
        announcements: '# announcements',
        order: '# order',
        tickets: '# support',
        'staff-inbox': '# inbox',
        'staff-announce': '# post news',
    };

    function apiOrigin() {
        /* portal.creedv2.com serves /api/* via portal-site/api proxy → same-origin, no CORS */
        const proxy = document.querySelector('meta[name="creed-api-proxy"]');
        if (proxy && proxy.getAttribute('content') === '1') return '';

        const m = document.querySelector('meta[name="creed-api-origin"]');
        let raw =
            (m && m.getAttribute('content')) ||
            (typeof window !== 'undefined' && window.__CREED_API_ORIGIN__) ||
            '';
        raw = String(raw).trim();
        if (!raw && typeof location !== 'undefined') {
            const h = location.hostname;
            const isMainStore = h === 'creedv2.com' || h === 'www.creedv2.com';
            /* Use www so fetch does not follow apex→www redirect (browsers often drop Authorization on redirect) */
            if (!isMainStore) raw = 'https://www.creedv2.com';
        }
        return raw.replace(/\/$/, '');
    }

    function apiUrl(path) {
        if (/^https?:\/\//i.test(path)) return path;
        const o = apiOrigin();
        return o ? o + path : path;
    }

    const api = (path, opts = {}) => {
        const tokenRaw = localStorage.getItem(STORAGE_KEY);
        const token = tokenRaw ? tokenRaw.trim() : '';
        const headers = { ...opts.headers };
        const method = String(opts.method || 'GET').toUpperCase();
        if (token && !opts.skipAuth) headers.Authorization = 'Bearer ' + token;
        if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        /* Pass ?token= on every authed request — GET/POST/PATCH often lose Authorization cross-origin or via proxies */
        let pathWithAuth = path;
        if (token && !opts.skipAuth && !/[&?]token=/.test(path)) {
            const sep = path.includes('?') ? '&' : '?';
            pathWithAuth = path + sep + 'token=' + encodeURIComponent(token);
        }
        const fetchOpts = { ...opts, headers, mode: 'cors', credentials: 'omit' };
        return fetch(apiUrl(pathWithAuth), fetchOpts).then(async (r) => {
            const text = await r.text();
            let data;
            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                data = { raw: text };
            }
            if (!r.ok) throw new Error(data.error || data.message || r.statusText);
            return data;
        });
    };

    function staffToken() {
        return sessionStorage.getItem(STAFF_KEY) || '';
    }

    function apiStaff(path, opts = {}) {
        const st = (staffToken() || '').trim();
        if (!st) return Promise.reject(new Error('Staff session required'));
        const method = String(opts.method || 'GET').toUpperCase();
        let url = path;
        /* GET / DELETE: also pass ?token= — some stacks mishandle Authorization */
        if ((method === 'GET' || method === 'DELETE') && !/[&?]token=/.test(path)) {
            url = path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(st);
        }
        const headers = {
            ...opts.headers,
            Authorization: 'Bearer ' + st,
            'X-Creed-Staff-Token': st,
        };
        if (opts.body && typeof opts.body === 'object') {
            headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        const fetchOpts = { ...opts, headers, mode: 'cors', credentials: 'omit' };
        return fetch(apiUrl(url), fetchOpts).then(async (r) => {
            const text = await r.text();
            let data;
            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                data = { raw: text };
            }
            if (!r.ok) throw new Error(data.error || data.message || r.statusText);
            return data;
        });
    }

    function initTokenFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const t = params.get('t');
        if (t && t.startsWith('op_')) {
            localStorage.setItem(STORAGE_KEY, t.trim());
            const u = new URL(window.location.href);
            u.searchParams.delete('t');
            window.history.replaceState({}, '', u.pathname + u.search);
        }
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    /** Strip invisible chars / smart quotes from pasted order ids */
    function normalizePortalKey(s) {
        return String(s || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim()
            .replace(/^["'«»]+|["'«»]+$/g, '')
            .trim();
    }

    function setClaimStatus(msg, isError) {
        const o = document.getElementById('portal-claim-status-order');
        const t = document.getElementById('portal-claim-status-tickets');
        const html = msg
            ? `<p class="${isError ? 'error-text' : 'muted'}" style="margin-top:10px;font-size:0.9rem;line-height:1.45;">${escapeHtml(msg)}</p>`
            : '';
        if (o) o.innerHTML = html;
        if (t) t.innerHTML = html;
    }

    let activeChannel = 'announcements';
    let pollTimer = null;
    let staffPollTimer = null;
    let activeTicketId = null;
    let staffActiveTicketId = null;
    let lastCustomerTickets = [];
    let customerActiveTicket = null;
    let lastStaffTickets = [];
    let staffActiveTicket = null;
    /** @type {Set<string>|null} */
    let staffSeenMessageIds = null;

    const STAFF_PING_STORAGE_KEY = 'creed_portal_staff_ping';

    function playStaffNewMessageSound() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            const now = ctx.currentTime;
            const master = ctx.createGain();
            master.gain.setValueAtTime(0.11, now);
            master.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            master.connect(ctx.destination);
            [523, 698, 880].forEach((freq, i) => {
                const o = ctx.createOscillator();
                o.type = 'sine';
                o.frequency.setValueAtTime(freq, now + i * 0.055);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.4, now + i * 0.055);
                g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.055 + 0.11);
                o.connect(g);
                g.connect(master);
                o.start(now + i * 0.055);
                o.stop(now + i * 0.055 + 0.14);
            });
            setTimeout(() => {
                try {
                    ctx.close();
                } catch (_) {}
            }, 500);
        } catch (_) {}
    }

    function broadcastStaffCustomerMessage(ticketId, messageId) {
        try {
            localStorage.setItem(
                STAFF_PING_STORAGE_KEY,
                JSON.stringify({ ticketId, messageId, ts: Date.now() })
            );
        } catch (_) {}
    }

    window.addEventListener('storage', (e) => {
        if (e.key !== STAFF_PING_STORAGE_KEY || !e.newValue) return;
        try {
            const d = JSON.parse(e.newValue);
            if (d.messageId && staffSeenMessageIds && staffSeenMessageIds.has(d.messageId)) return;
            if (d.messageId && staffSeenMessageIds) staffSeenMessageIds.add(d.messageId);
            playStaffNewMessageSound();
        } catch (_) {}
    });

    function ticketStatusLabel(s) {
        if (s === 'claimed') return 'Order claimed';
        if (s === 'closed') return 'Closed';
        return 'Open';
    }

    function updateCustomerTicketReplyUI() {
        const area = document.getElementById('customer-reply-area');
        const banner = document.getElementById('customer-ticket-banner');
        const st = customerActiveTicket?.status || 'open';
        if (st === 'claimed') {
            if (banner) {
                banner.style.display = 'block';
                banner.textContent =
                    'This order was marked as claimed. This thread is locked — open a new ticket if you still need help.';
            }
            if (area) area.style.display = 'none';
        } else if (st === 'closed') {
            if (banner) {
                banner.style.display = 'block';
                banner.textContent = 'This ticket is closed.';
            }
            if (area) area.style.display = 'none';
        } else {
            if (banner) banner.style.display = 'none';
            if (area) area.style.display = 'block';
        }
    }

    function updateStaffTicketActionsUI() {
        const closeBtn = document.getElementById('btn-staff-close-ticket');
        const claimBtn = document.getElementById('btn-staff-claim-ticket');
        const reopenBtn = document.getElementById('btn-staff-reopen-ticket');
        const banner = document.getElementById('staff-ticket-banner');
        const replyArea = document.getElementById('staff-reply-area');
        const t = staffActiveTicket;
        if (!t || !t.id) return;
        const s = t.status || 'open';
        if (s === 'claimed') {
            if (banner) {
                banner.style.display = 'block';
                banner.textContent =
                    'Order claimed by customer — this thread is locked permanently (cannot reopen).';
            }
            if (closeBtn) closeBtn.style.display = 'none';
            if (claimBtn) claimBtn.style.display = 'none';
            if (reopenBtn) reopenBtn.style.display = 'none';
            if (replyArea) replyArea.style.display = 'none';
        } else if (s === 'closed') {
            if (banner) {
                banner.style.display = 'block';
                banner.textContent = 'Ticket closed. Reopen to send messages.';
            }
            if (closeBtn) closeBtn.style.display = 'none';
            if (claimBtn) claimBtn.style.display = 'none';
            if (reopenBtn) reopenBtn.style.display = 'inline-flex';
            if (replyArea) replyArea.style.display = 'none';
        } else {
            if (banner) banner.style.display = 'none';
            if (closeBtn) closeBtn.style.display = 'inline-flex';
            if (claimBtn) claimBtn.style.display = 'inline-flex';
            if (reopenBtn) reopenBtn.style.display = 'none';
            if (replyArea) replyArea.style.display = 'block';
        }
    }

    function setChannel(id) {
        activeChannel = id;
        document.querySelectorAll('.portal-ch').forEach((b) => {
            b.classList.toggle('active', b.getAttribute('data-channel') === id);
        });
        document.querySelectorAll('.portal-ch-panel').forEach((p) => {
            p.classList.toggle('active', p.getAttribute('data-panel') === id);
        });
        const title = document.getElementById('portal-channel-title');
        if (title) title.textContent = CHANNEL_TITLES[id] || '#';

        if (id === 'tickets') refreshCustomerAuth();
        if (id === 'order') refreshCustomerAuth();
        if (id === 'staff-inbox' && staffToken()) loadStaffQueue();
        if (id === 'staff-announce' && staffToken()) loadStaffAnnouncementsAdmin();
    }

    function renderAnnouncementBody(a) {
        const fmt = a.body_format || 'plain';
        if (fmt === 'markdown' && typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                const raw = marked.parse(String(a.body || ''), { breaks: true, gfm: true });
                return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
            } catch (_) {
                /* fall through */
            }
        }
        return escapeHtml(a.body || '').replace(/\n/g, '<br>');
    }

    async function loadAnnouncements() {
        const el = document.getElementById('announcements-list');
        if (!el) return;
        el.innerHTML = '<p class="muted">Loading…</p>';
        try {
            const data = await api('/api/portal-announcements', { skipAuth: true });
            const items = data.announcements || [];
            if (!items.length) {
                el.innerHTML = '<p class="muted">No announcements yet.</p>';
                return;
            }
            el.innerHTML = items
                .map(
                    (a) => `
                <article class="glass-panel portal-card">
                    <h3>${escapeHtml(a.title)}</h3>
                    <p class="portal-meta">${a.published_at ? new Date(a.published_at).toLocaleString() : ''}</p>
                    <div class="portal-body portal-body-md">${renderAnnouncementBody(a)}</div>
                </article>`
                )
                .join('');
        } catch (e) {
            const hint = e && e.message ? escapeHtml(e.message) : 'Network or server error.';
            el.innerHTML = `<p class="error-text">Could not load announcements.</p><p class="muted portal-error-detail">${hint}</p><p class="muted portal-error-detail">If this is a new setup, run <code>portal-schema.sql</code> in Supabase.</p>`;
        }
    }

    let editingAnnId = null;
    let lastAdminAnnouncements = [];

    function toDatetimeLocalValue(d) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function clearAnnForm() {
        editingAnnId = null;
        const t = document.getElementById('admin-ann-title');
        const b = document.getElementById('admin-ann-body');
        const p = document.getElementById('admin-ann-publish');
        const w = document.getElementById('admin-ann-when');
        const st = document.getElementById('admin-ann-status');
        if (t) t.value = '';
        if (b) b.value = '';
        if (p) p.checked = true;
        if (w) w.value = '';
        if (st) st.textContent = '';
    }

    function applyMdInsert(kind) {
        const ta = document.getElementById('admin-ann-body');
        if (!ta) return;
        const s = ta.selectionStart;
        const e = ta.selectionEnd;
        const sel = ta.value.slice(s, e);
        let rep = '';
        if (kind === 'bold') rep = `**${sel || 'bold'}**`;
        else if (kind === 'italic') rep = `*${sel || 'italic'}*`;
        else if (kind === 'h2') rep = `## ${sel || 'Heading'}\n`;
        else if (kind === 'link') {
            const url = window.prompt('Link URL (https://…)', 'https://');
            if (url == null || url === '') return;
            rep = `[${sel || 'link text'}](${url})`;
        } else if (kind === 'ul') rep = `- ${sel || 'item'}\n`;
        else if (kind === 'code') rep = `\`${sel || 'code'}\``;
        else return;
        ta.value = ta.value.slice(0, s) + rep + ta.value.slice(e);
        ta.focus();
        const ns = s + rep.length;
        ta.setSelectionRange(ns, ns);
    }

    async function loadStaffAnnouncementsAdmin() {
        const list = document.getElementById('admin-ann-list');
        if (!list || !staffToken()) return;
        list.innerHTML = '<p class="muted">Loading…</p>';
        try {
            const data = await apiStaff('/api/admin-portal-announcements');
            const items = data.announcements || [];
            lastAdminAnnouncements = items;
            if (!items.length) {
                list.innerHTML = '<p class="muted">No posts yet.</p>';
                return;
            }
            list.innerHTML = items
                .map(
                    (a) => `
                <div class="portal-ann-row" data-id="${escapeHtml(a.id)}">
                    <div style="min-width:0;">
                        <h4>${escapeHtml(a.title)}</h4>
                        <div class="portal-ann-meta">${a.is_published ? 'Published' : 'Draft'} · ${new Date(a.created_at).toLocaleString()}</div>
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0;">
                        <button type="button" class="btn btn-secondary ann-edit" style="font-size:0.8rem;padding:6px 10px;">Edit</button>
                        <button type="button" class="btn btn-secondary ann-del" style="font-size:0.8rem;padding:6px 10px;">Delete</button>
                    </div>
                </div>`
                )
                .join('');

            list.querySelectorAll('.ann-edit').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('[data-id]');
                    const id = row && row.getAttribute('data-id');
                    const item = lastAdminAnnouncements.find((x) => x.id === id);
                    if (item) openAnnEdit(item);
                });
            });
            list.querySelectorAll('.ann-del').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('[data-id]');
                    const id = row && row.getAttribute('data-id');
                    if (id) deleteAnn(id);
                });
            });
        } catch (err) {
            list.innerHTML = `<p class="error-text">${escapeHtml(err.message || 'Failed')}</p>`;
        }
    }

    function openAnnEdit(item) {
        editingAnnId = item.id;
        const t = document.getElementById('admin-ann-title');
        const b = document.getElementById('admin-ann-body');
        const p = document.getElementById('admin-ann-publish');
        const w = document.getElementById('admin-ann-when');
        const st = document.getElementById('admin-ann-status');
        if (t) t.value = item.title || '';
        if (b) b.value = item.body || '';
        if (p) p.checked = !!item.is_published;
        if (w) {
            w.value = item.published_at ? toDatetimeLocalValue(new Date(item.published_at)) : '';
        }
        if (st) st.textContent = 'Editing — save to update.';
        document.getElementById('admin-ann-title')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function deleteAnn(id) {
        if (!id || !confirm('Delete this announcement?')) return;
        try {
            await apiStaff('/api/admin-portal-announcements?id=' + encodeURIComponent(id), { method: 'DELETE' });
            if (editingAnnId === id) clearAnnForm();
            await loadStaffAnnouncementsAdmin();
            await loadAnnouncements();
        } catch (e) {
            alert(e.message || 'Delete failed');
        }
    }

    async function refreshCustomerAuth() {
        const token = localStorage.getItem(STORAGE_KEY);
        const gateOrder = document.getElementById('portal-gate-order');
        const bodyOrder = document.getElementById('portal-order-body');
        const hintOrder = document.getElementById('portal-gate-hint-order');
        const gateTickets = document.getElementById('portal-gate-tickets');
        const bodyTickets = document.getElementById('portal-tickets-body');

        if (!token) {
            if (gateOrder) gateOrder.style.display = 'block';
            if (bodyOrder) bodyOrder.style.display = 'none';
            if (hintOrder) hintOrder.textContent = '';
            if (gateTickets) gateTickets.style.display = 'block';
            if (bodyTickets) bodyTickets.style.display = 'none';
            return;
        }

        try {
            const data = await api('/api/portal-me');
            if (gateOrder) gateOrder.style.display = 'none';
            if (bodyOrder) {
                bodyOrder.style.display = 'block';
                const os = document.getElementById('order-summary');
                if (os) os.innerHTML = formatOrder(data.order);
            }
            if (gateTickets) gateTickets.style.display = 'none';
            if (bodyTickets) bodyTickets.style.display = 'block';
            await loadTickets();
        } catch (e) {
            const msg = e.message || '';
            if (
                msg.includes('Invalid or expired') ||
                msg.includes('Portal token required') ||
                msg.includes('Unauthorized')
            ) {
                localStorage.removeItem(STORAGE_KEY);
            }
            if (gateOrder) {
                gateOrder.style.display = 'block';
                if (hintOrder) {
                    hintOrder.textContent =
                        msg.includes('Invalid or expired') || msg.includes('Portal token required')
                            ? 'Previous sign-in expired. Enter your order id below and tap Continue.'
                            : msg || 'Could not verify session.';
                }
            }
            if (bodyOrder) bodyOrder.style.display = 'none';
            if (gateTickets) gateTickets.style.display = 'block';
            if (bodyTickets) bodyTickets.style.display = 'none';
        }
    }

    function formatOrder(order) {
        if (!order) return '';
        const items = Array.isArray(order.items) ? order.items : [];
        const lines = items
            .map((i) => {
                const name = i.name || i.title || i.product || 'Item';
                const q = i.quantity || 1;
                return `<li>${escapeHtml(String(name))} × ${q}</li>`;
            })
            .join('');
        return `
            <p><strong>Order</strong> <code>${escapeHtml(order.id)}</code></p>
            <p class="muted">${escapeHtml(order.amount || '')} ${escapeHtml(order.currency || '')} · Paid ${order.paid_at ? new Date(order.paid_at).toLocaleString() : '—'}</p>
            <ul class="order-items">${lines || '<li>—</li>'}</ul>
        `;
    }

    async function loadTickets() {
        const el = document.getElementById('tickets-list');
        if (!el) return;
        el.innerHTML = '<p class="muted">Loading…</p>';
        try {
            const data = await api('/api/portal-tickets');
            const tickets = data.tickets || [];
            lastCustomerTickets = tickets;
            if (!tickets.length) {
                el.innerHTML = '<p class="muted">No tickets yet.</p>';
            } else {
                el.innerHTML = tickets
                    .map(
                        (t) => `
                    <button type="button" class="ticket-row glass-panel ${activeTicketId === t.id ? 'active' : ''}" data-id="${t.id}">
                        <span class="ticket-subj">${escapeHtml(t.subject)}</span>
                        <span class="ticket-badge">${escapeHtml(ticketStatusLabel(t.status))}</span>
                    </button>`
                    )
                    .join('');
                el.querySelectorAll('.ticket-row').forEach((btn) => {
                    btn.addEventListener('click', () => openTicket(btn.getAttribute('data-id')));
                });
            }
            if (activeTicketId) {
                const still = tickets.some((t) => t.id === activeTicketId);
                if (still) {
                    customerActiveTicket = tickets.find((t) => t.id === activeTicketId) || customerActiveTicket;
                    openTicket(activeTicketId);
                } else {
                    activeTicketId = null;
                    customerActiveTicket = null;
                }
            }
        } catch (e) {
            el.innerHTML = '<p class="error-text">Could not load tickets.</p>';
        }
    }

    function openTicket(ticketId) {
        activeTicketId = ticketId;
        customerActiveTicket =
            lastCustomerTickets.find((t) => t.id === ticketId) || { id: ticketId, status: 'open' };
        document.querySelectorAll('.ticket-row').forEach((b) => {
            b.classList.toggle('active', b.getAttribute('data-id') === ticketId);
        });
        const panel = document.getElementById('ticket-thread');
        const ph = document.getElementById('ticket-thread-placeholder');
        if (ph) ph.style.display = 'none';
        if (panel) panel.style.display = 'block';
        updateCustomerTicketReplyUI();
        loadMessages(ticketId, false, false);
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            if (activeTicketId && activeChannel === 'tickets') loadMessages(activeTicketId, true, false);
        }, 12000);
    }

    async function loadMessages(ticketId, silent, asStaff) {
        const box = document.getElementById(asStaff ? 'staff-messages-box' : 'messages-box');
        if (!box) return;
        if (!silent) box.innerHTML = '<p class="muted">Loading…</p>';
        try {
            const fetchFn = asStaff ? apiStaff : api;
            const data = await fetchFn('/api/portal-messages?ticket_id=' + encodeURIComponent(ticketId));
            const msgs = data.messages || [];
            box.innerHTML = msgs
                .map(
                    (m) => `
                <div class="msg ${m.author_role === 'admin' ? 'msg-admin' : 'msg-you'}">
                    <span class="msg-role">${m.author_role === 'admin' ? 'Staff' : 'Customer'}</span>
                    <div class="msg-body">${escapeHtml(m.body).replace(/\n/g, '<br>')}</div>
                    <span class="msg-time">${new Date(m.created_at).toLocaleString()}</span>
                </div>`
                )
                .join('');
            box.scrollTop = box.scrollHeight;

            if (asStaff) {
                if (!silent) {
                    staffSeenMessageIds = new Set(msgs.map((m) => m.id));
                } else if (staffSeenMessageIds) {
                    for (let i = 0; i < msgs.length; i++) {
                        const m = msgs[i];
                        if (staffSeenMessageIds.has(m.id)) continue;
                        staffSeenMessageIds.add(m.id);
                        if (m.author_role === 'customer') {
                            playStaffNewMessageSound();
                            broadcastStaffCustomerMessage(ticketId, m.id);
                        }
                    }
                } else {
                    staffSeenMessageIds = new Set(msgs.map((m) => m.id));
                }
            }

            if (data.ticket) {
                if (asStaff) {
                    staffActiveTicket = { ...(staffActiveTicket || {}), ...data.ticket };
                    const inList = lastStaffTickets.find((x) => x.id === data.ticket.id);
                    if (inList) inList.status = data.ticket.status;
                    updateStaffTicketActionsUI();
                } else {
                    customerActiveTicket = { ...(customerActiveTicket || {}), ...data.ticket };
                    const inList = lastCustomerTickets.find((x) => x.id === data.ticket.id);
                    if (inList) inList.status = data.ticket.status;
                    updateCustomerTicketReplyUI();
                }
            }
        } catch (e) {
            if (!silent) box.innerHTML = '<p class="error-text">Could not load messages.</p>';
        }
    }

    async function loadStaffQueue() {
        const list = document.getElementById('staff-inbox-list');
        const locked = document.getElementById('staff-inbox-locked');
        const body = document.getElementById('staff-inbox-body');
        if (!staffToken()) {
            if (locked) locked.style.display = 'block';
            if (body) body.style.display = 'none';
            return;
        }
        if (locked) locked.style.display = 'none';
        if (body) body.style.display = 'block';
        if (!list) return;
        list.innerHTML = '<p class="muted">Loading…</p>';
        try {
            const data = await apiStaff('/api/admin-portal-tickets');
            const tickets = data.tickets || [];
            lastStaffTickets = tickets;
            if (!tickets.length) {
                lastStaffTickets = [];
                list.innerHTML = '<p class="muted">No tickets.</p>';
                return;
            }
            list.innerHTML = tickets
                .map(
                    (t) => `
                <button type="button" class="staff-ticket-row glass-panel ${staffActiveTicketId === t.id ? 'active' : ''}" data-id="${t.id}">
                    <span class="staff-ticket-main">
                        <span class="ticket-subj">${escapeHtml(t.subject)}</span>
                        <span class="ticket-meta"><code>${escapeHtml(String(t.order_id || '—'))}</code></span>
                    </span>
                    <span class="ticket-badge">${escapeHtml(ticketStatusLabel(t.status))}</span>
                </button>`
                )
                .join('');
            list.querySelectorAll('.staff-ticket-row').forEach((btn) => {
                btn.addEventListener('click', () => openStaffTicket(btn.getAttribute('data-id')));
            });
            if (staffActiveTicketId) {
                const cur = tickets.find((x) => x.id === staffActiveTicketId);
                if (cur) staffActiveTicket = cur;
            }
        } catch (e) {
            list.innerHTML = `<p class="error-text">${escapeHtml(e.message || 'Failed')}</p><p class="muted" style="font-size:0.85rem">Check ADMIN_TOKEN.</p>`;
        }
    }

    function openStaffTicket(ticketId) {
        staffSeenMessageIds = null;
        staffActiveTicketId = ticketId;
        staffActiveTicket =
            lastStaffTickets.find((t) => t.id === ticketId) || { id: ticketId, status: 'open' };
        document.querySelectorAll('.staff-ticket-row').forEach((b) => {
            b.classList.toggle('active', b.getAttribute('data-id') === ticketId);
        });
        const thread = document.getElementById('staff-ticket-thread');
        const ph = document.getElementById('staff-thread-placeholder');
        if (ph) ph.style.display = 'none';
        if (thread) thread.style.display = 'block';
        updateStaffTicketActionsUI();
        loadMessages(ticketId, false, true);
        if (staffPollTimer) clearInterval(staffPollTimer);
        staffPollTimer = setInterval(() => {
            if (staffActiveTicketId && staffToken()) loadMessages(staffActiveTicketId, true, true);
        }, 12000);
    }

    async function savePortalTokenFromInputs() {
        const a = document.getElementById('manual-token-order');
        const b = document.getElementById('manual-token-tickets');
        const va = normalizePortalKey(a?.value || '');
        const vb = normalizePortalKey(b?.value || '');
        const v = va || vb;
        const btnO = document.getElementById('btn-save-token-order');
        const btnT = document.getElementById('btn-save-token-tickets');

        const setBusy = (on) => {
            [btnO, btnT].forEach((btn) => {
                if (btn) {
                    btn.disabled = on;
                    btn.setAttribute('aria-busy', on ? 'true' : 'false');
                }
            });
        };

        if (!v) {
            setClaimStatus('Enter your order id (from the payment success page or your confirmation email).', true);
            return;
        }
        setClaimStatus('');
        setBusy(true);

        if (v.startsWith('op_')) {
            localStorage.setItem(STORAGE_KEY, v.trim());
            if (a) a.value = '';
            if (b) b.value = '';
            setBusy(false);
            setClaimStatus('Signed in.');
            await refreshCustomerAuth();
            return;
        }

        try {
            const r = await fetch(apiUrl('/api/portal-claim-by-order'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: v }),
                mode: 'cors',
                credentials: 'omit',
            });
            const text = await r.text();
            let data;
            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                data = { error: text || r.statusText };
            }
            if (!r.ok) throw new Error(data.error || data.message || r.statusText);
            const tok = data.portal_token;
            if (!tok || typeof tok !== 'string') throw new Error('Invalid response from server.');
            localStorage.setItem(STORAGE_KEY, tok.trim());
            if (a) a.value = '';
            if (b) b.value = '';
            setClaimStatus('You’re signed in. Open Support to create a ticket.');
            await refreshCustomerAuth();
        } catch (e) {
            setClaimStatus(e.message || 'Could not verify that order id.', true);
        } finally {
            setBusy(false);
        }
    }

    function updateStaffUI() {
        const ok = !!staffToken();
        const grp = document.getElementById('staff-channel-group');
        const btnIn = document.getElementById('btn-staff-signin');
        const btnOut = document.getElementById('btn-staff-signout');
        if (grp) grp.hidden = !ok;
        if (btnIn) btnIn.hidden = ok;
        if (btnOut) btnOut.hidden = !ok;
        if (ok && activeChannel === 'staff-inbox') loadStaffQueue();
        if (ok && activeChannel === 'staff-announce') loadStaffAnnouncementsAdmin();
    }

    function bind() {
        document.querySelectorAll('.portal-ch').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-channel');
                if (id) setChannel(id);
            });
        });

        const saveOrder = document.getElementById('btn-save-token-order');
        const saveTickets = document.getElementById('btn-save-token-tickets');
        if (saveOrder) saveOrder.addEventListener('click', savePortalTokenFromInputs);
        if (saveTickets) saveTickets.addEventListener('click', savePortalTokenFromInputs);

        ['manual-token-order', 'manual-token-tickets'].forEach((id) => {
            document.getElementById(id)?.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    savePortalTokenFromInputs();
                }
            });
        });

        document.getElementById('btn-logout')?.addEventListener('click', () => {
            localStorage.removeItem(STORAGE_KEY);
            activeTicketId = null;
            if (pollTimer) clearInterval(pollTimer);
            document.getElementById('ticket-thread').style.display = 'none';
            const ph = document.getElementById('ticket-thread-placeholder');
            if (ph) ph.style.display = 'block';
            refreshCustomerAuth();
        });

        document.getElementById('btn-create-ticket')?.addEventListener('click', async () => {
            const subject = document.getElementById('new-ticket-subject')?.value.trim() || '';
            const message = document.getElementById('new-ticket-msg')?.value.trim() || '';
            if (subject.length < 3) {
                alert('Subject must be at least 3 characters.');
                return;
            }
            try {
                await api('/api/portal-tickets', { method: 'POST', body: { subject, message: message || undefined } });
                document.getElementById('new-ticket-subject').value = '';
                document.getElementById('new-ticket-msg').value = '';
                await loadTickets();
            } catch (e) {
                alert(e.message);
            }
        });

        document.getElementById('btn-send-msg')?.addEventListener('click', async () => {
            if (!activeTicketId) return;
            const body = document.getElementById('reply-msg')?.value.trim() || '';
            if (!body) return;
            try {
                await api('/api/portal-messages', { method: 'POST', body: { ticket_id: activeTicketId, body } });
                document.getElementById('reply-msg').value = '';
                await loadMessages(activeTicketId, false, false);
            } catch (e) {
                alert(e.message);
            }
        });

        document.getElementById('btn-staff-signin')?.addEventListener('click', () => {
            document.getElementById('staff-modal')?.removeAttribute('hidden');
        });
        document.getElementById('btn-staff-cancel')?.addEventListener('click', () => {
            document.getElementById('staff-modal')?.setAttribute('hidden', '');
        });
        document.getElementById('staff-modal-backdrop')?.addEventListener('click', () => {
            document.getElementById('staff-modal')?.setAttribute('hidden', '');
        });

        document.getElementById('btn-staff-confirm')?.addEventListener('click', async () => {
            const inp = document.getElementById('staff-token-input');
            const tok = inp?.value.trim() || '';
            if (!tok) return;
            sessionStorage.setItem(STAFF_KEY, tok);
            document.getElementById('staff-modal')?.setAttribute('hidden', '');
            if (inp) inp.value = '';
            try {
                await apiStaff('/api/admin-portal-tickets');
                updateStaffUI();
                setChannel('staff-inbox');
            } catch (e) {
                sessionStorage.removeItem(STAFF_KEY);
                alert(e.message || 'Invalid token');
                updateStaffUI();
            }
        });

        document.getElementById('btn-staff-signout')?.addEventListener('click', () => {
            sessionStorage.removeItem(STAFF_KEY);
            staffActiveTicketId = null;
            staffActiveTicket = null;
            lastStaffTickets = [];
            if (staffPollTimer) clearInterval(staffPollTimer);
            document.getElementById('staff-ticket-thread').style.display = 'none';
            const sp = document.getElementById('staff-thread-placeholder');
            if (sp) sp.style.display = 'block';
            updateStaffUI();
            if (activeChannel === 'staff-inbox' || activeChannel === 'staff-announce') setChannel('announcements');
        });

        document.getElementById('btn-staff-send')?.addEventListener('click', async () => {
            if (!staffActiveTicketId) return;
            const body = document.getElementById('staff-reply-msg')?.value.trim() || '';
            if (!body) return;
            try {
                await apiStaff('/api/portal-messages', {
                    method: 'POST',
                    body: { ticket_id: staffActiveTicketId, body },
                });
                document.getElementById('staff-reply-msg').value = '';
                await loadMessages(staffActiveTicketId, false, true);
            } catch (e) {
                alert(e.message);
            }
        });

        document.getElementById('btn-staff-close-ticket')?.addEventListener('click', async () => {
            if (!staffActiveTicketId) return;
            if (!confirm('Close this ticket? Customers can’t reply until you reopen it.')) return;
            try {
                await apiStaff('/api/admin-portal-tickets', {
                    method: 'PATCH',
                    body: { id: staffActiveTicketId, status: 'closed' },
                });
                staffActiveTicket = { ...(staffActiveTicket || {}), id: staffActiveTicketId, status: 'closed' };
                const inList = lastStaffTickets.find((x) => x.id === staffActiveTicketId);
                if (inList) inList.status = 'closed';
                updateStaffTicketActionsUI();
                await loadStaffQueue();
                await loadMessages(staffActiveTicketId, false, true);
            } catch (e) {
                alert(e.message);
            }
        });

        document.getElementById('btn-staff-claim-ticket')?.addEventListener('click', async () => {
            if (!staffActiveTicketId) return;
            if (
                !confirm(
                    'Mark this order as claimed by the customer? This locks the thread permanently — it cannot be reopened.'
                )
            )
                return;
            try {
                await apiStaff('/api/admin-portal-tickets', {
                    method: 'PATCH',
                    body: { id: staffActiveTicketId, status: 'claimed' },
                });
                staffActiveTicket = { ...(staffActiveTicket || {}), id: staffActiveTicketId, status: 'claimed' };
                const inList = lastStaffTickets.find((x) => x.id === staffActiveTicketId);
                if (inList) inList.status = 'claimed';
                updateStaffTicketActionsUI();
                await loadStaffQueue();
                await loadMessages(staffActiveTicketId, false, true);
            } catch (e) {
                alert(e.message);
            }
        });

        document.getElementById('btn-staff-reopen-ticket')?.addEventListener('click', async () => {
            if (!staffActiveTicketId) return;
            try {
                await apiStaff('/api/admin-portal-tickets', {
                    method: 'PATCH',
                    body: { id: staffActiveTicketId, status: 'open' },
                });
                staffActiveTicket = { ...(staffActiveTicket || {}), id: staffActiveTicketId, status: 'open' };
                const inList = lastStaffTickets.find((x) => x.id === staffActiveTicketId);
                if (inList) inList.status = 'open';
                updateStaffTicketActionsUI();
                await loadStaffQueue();
                await loadMessages(staffActiveTicketId, false, true);
            } catch (e) {
                alert(e.message);
            }
        });

        document.getElementById('admin-ann-toolbar')?.addEventListener('click', (ev) => {
            const btn = ev.target.closest('[data-insert]');
            if (!btn) return;
            ev.preventDefault();
            applyMdInsert(btn.getAttribute('data-insert'));
        });

        document.getElementById('btn-ann-clear')?.addEventListener('click', () => {
            clearAnnForm();
        });

        document.getElementById('btn-ann-save')?.addEventListener('click', async () => {
            const title = document.getElementById('admin-ann-title')?.value.trim() || '';
            const bodyTxt = document.getElementById('admin-ann-body')?.value || '';
            const publish = document.getElementById('admin-ann-publish')?.checked !== false;
            const whenEl = document.getElementById('admin-ann-when');
            const statusEl = document.getElementById('admin-ann-status');
            if (title.length < 1) {
                if (statusEl) statusEl.textContent = 'Title required.';
                return;
            }
            if (bodyTxt.length < 1) {
                if (statusEl) statusEl.textContent = 'Body required.';
                return;
            }
            let published_at = null;
            if (publish) {
                if (whenEl && whenEl.value) {
                    published_at = new Date(whenEl.value).toISOString();
                } else {
                    published_at = new Date().toISOString();
                }
            }
            const payload = {
                title,
                body: bodyTxt,
                body_format: 'markdown',
                is_published: publish,
                published_at: publish ? published_at : null,
            };
            try {
                if (statusEl) statusEl.textContent = 'Saving…';
                if (editingAnnId) {
                    await apiStaff('/api/admin-portal-announcements', {
                        method: 'PATCH',
                        body: { id: editingAnnId, ...payload },
                    });
                } else {
                    await apiStaff('/api/admin-portal-announcements', { method: 'POST', body: payload });
                }
                clearAnnForm();
                if (statusEl) statusEl.textContent = 'Saved.';
                await loadStaffAnnouncementsAdmin();
                await loadAnnouncements();
            } catch (e) {
                if (statusEl) statusEl.textContent = e.message || 'Save failed';
            }
        });
    }

    if (typeof marked !== 'undefined' && typeof marked.setOptions === 'function') {
        marked.setOptions({ breaks: true, gfm: true });
    }

    initTokenFromUrl();
    bind();
    loadAnnouncements();
    refreshCustomerAuth();
    if (staffToken()) updateStaffUI();
})();
