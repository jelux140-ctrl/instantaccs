/* =========================================
   CREED - ACCEPTED PAYMENT METHOD BADGES
   Renders the official brand marks wherever a
   <div data-accepted-payments></div> placeholder appears.

   On product pages it also self-injects beneath the Add to Cart button, so
   the badges appear on all product pages without editing each one.

   Brand marks are served locally from /assets/payment-methods/brands/ -
   never hotlinked, so they cannot break or leak referrers to third parties.
   ========================================= */

(function () {
    'use strict';

    var BASE = '/assets/payment-methods/brands/';

    // Card networks are 780x500 colour marks; wallets are 24x24 monochrome.
    // `wide` drives the aspect ratio of the containing chip.
    var METHODS = [
        { file: 'visa.svg',       label: 'Visa',              wide: true },
        { file: 'mastercard.svg', label: 'Mastercard',        wide: true },
        { file: 'amex.svg',       label: 'American Express',  wide: true },
        { file: 'applepay.svg',   label: 'Apple Pay',         wide: false },
        { file: 'googlepay.svg',  label: 'Google Pay',        wide: false },
        { file: 'klarna.svg',     label: 'Klarna',            wide: false },
        // Handled manually rather than through Stripe, but still accepted -
        // so they belong on the product page strip. The checkout form filters
        // them out via data-only, since Stripe cannot offer them.
        { file: 'paypal.svg',     label: 'PayPal',            wide: true },
        { file: 'litecoin.svg',   label: 'Litecoin',          wide: false }
    ];

    function build(opts) {
        opts = opts || {};

        var wrap = document.createElement('div');
        wrap.className = 'accepted-payments' + (opts.compact ? ' accepted-payments--compact' : '');

        if (opts.heading !== false) {
            var h = document.createElement('span');
            h.className = 'accepted-payments__label';
            h.textContent = 'Secure checkout';
            wrap.appendChild(h);
        }

        var row = document.createElement('div');
        row.className = 'accepted-payments__row';

        // `only` limits the row to specific marks, e.g. just the methods
        // Stripe can actually offer in our currency.
        var list = METHODS;
        if (opts.only && opts.only.length) {
            list = opts.only.map(function (name) {
                return METHODS.filter(function (m) { return m.file === name + '.svg'; })[0];
            }).filter(Boolean);
        }

        list.forEach(function (m) {
            var chip = document.createElement('span');
            chip.className = 'pay-chip' + (m.wide ? ' pay-chip--wide' : '');

            var img = document.createElement('img');
            img.src = BASE + m.file;
            img.alt = m.label;
            img.loading = 'lazy';
            img.width = m.wide ? 40 : 26;
            img.height = 26;
            // A missing asset should leave no empty box behind.
            img.onerror = function () { chip.remove(); };

            chip.appendChild(img);
            row.appendChild(chip);
        });

        wrap.appendChild(row);
        return wrap;
    }

    function render() {
        var targets = document.querySelectorAll('[data-accepted-payments]');
        var placed = false;

        Array.prototype.forEach.call(targets, function (el) {
            if (el.getAttribute('data-payments-rendered')) return;
            el.setAttribute('data-payments-rendered', '1');

            var only = el.getAttribute('data-only');
            el.appendChild(build({
                heading: el.getAttribute('data-heading') !== 'false',
                compact: el.getAttribute('data-compact') === 'true',
                only: only ? only.split(',').map(function (s) { return s.trim(); }) : null
            }));
            placed = true;
        });

        // Product pages: drop it under the buy button when no placeholder exists.
        if (!placed) {
            var btn = document.getElementById('add-to-cart-btn');
            if (btn && btn.parentNode && !document.querySelector('.accepted-payments')) {
                btn.parentNode.insertBefore(build({ heading: true }), btn.nextSibling);
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }

    // Exposed so the cart modal can render badges after it builds its markup.
    window.CreedPaymentBadges = { build: build, render: render };
})();
