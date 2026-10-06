/* =========================================
   CREED - NAV WALLET BALANCE

   Shows the signed-in customer's credit balance in the navbar with an
   "Add credits" shortcut, and exposes the balance to cart.js.

   SECURITY NOTE: the balance shown here is display-only and is never trusted.
   customer_wallets is readable only by the signed-in owner (RLS:
   `TO authenticated USING (auth.uid() = user_id)`), so a user can read their
   own balance and nobody else's. Spending is authorised entirely server-side
   in /api/wallet-purchase, which re-reads the balance and debits atomically -
   tampering with this number in devtools buys nothing.
   ========================================= */

(function () {
    'use strict';

    var client = null;
    var state = { signedIn: false, balanceCents: 0, token: null, email: null };

    async function getClient() {
        if (client) return client;
        if (!window.supabase || !window.supabase.createClient) return null;
        var res = await fetch('/api/supabase-public');
        var cfg = await res.json();
        if (!res.ok || !cfg.url || !cfg.anonKey) return null;
        client = window.supabase.createClient(cfg.url, cfg.anonKey, {
            auth: { persistSession: true, autoRefreshToken: true }
        });
        return client;
    }

    function money(cents) {
        return '$' + ((Number(cents) || 0) / 100).toFixed(2);
    }

    function mount() {
        var host = document.querySelector('.nav-icons');
        if (!host || document.getElementById('nav-wallet')) return null;

        var wrap = document.createElement('div');
        wrap.id = 'nav-wallet';
        wrap.className = 'nav-wallet';
        wrap.hidden = true;
        wrap.innerHTML =
            '<span class="nav-wallet__balance" id="nav-wallet-balance" title="Your credit balance">$0.00</span>' +
            '<a class="nav-wallet__add" id="nav-wallet-add" href="/account" title="Add credits">' +
            '<i class="fas fa-plus"></i></a>';

        // Sit before the cart icon so currency reads left-to-right into the bag.
        var cart = document.getElementById('cart-icon');
        if (cart) host.insertBefore(wrap, cart); else host.appendChild(wrap);
        return wrap;
    }

    function paint() {
        var wrap = document.getElementById('nav-wallet');
        if (!wrap) return;
        wrap.hidden = !state.signedIn;
        var el = document.getElementById('nav-wallet-balance');
        if (el) el.textContent = money(state.balanceCents);
        document.dispatchEvent(new CustomEvent('creed:wallet', { detail: { ...state } }));
    }

    async function refresh() {
        var c = await getClient();
        if (!c) return;

        var session = (await c.auth.getSession()).data.session;
        if (!session || !session.user) {
            state = { signedIn: false, balanceCents: 0, token: null, email: null };
            paint();
            return;
        }

        state.signedIn = true;
        state.token = session.access_token;
        state.email = session.user.email || null;

        var row = await c.from('customer_wallets')
            .select('balance_cents')
            .eq('user_id', session.user.id)
            .maybeSingle();

        state.balanceCents = (row.data && row.data.balance_cents) || 0;
        paint();
    }

    async function init() {
        mount();
        await refresh();
        var c = await getClient();
        if (c) c.auth.onAuthStateChange(function () { refresh(); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.CreedWallet = {
        /** @returns {number} last known balance in cents - display only */
        balanceCents: function () { return state.balanceCents; },
        isSignedIn: function () { return state.signedIn; },
        /** Fresh access token for authorising a server-side wallet purchase. */
        token: async function () {
            var c = await getClient();
            if (!c) return null;
            var s = (await c.auth.getSession()).data.session;
            return s ? s.access_token : null;
        },
        refresh: refresh
    };
})();
