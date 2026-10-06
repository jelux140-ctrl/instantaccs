/* =========================================
   CREED - CART SYSTEM
   ========================================= */

const DEFAULT_CHECKOUT_API_URL = 'https://pay.creedv2.com/api/create-checkout';

let _siteConfigCache = null;

async function loadPublicSiteConfig() {
    if (_siteConfigCache) return _siteConfigCache;
    try {
        const r = await fetch('/api/public-site-config');
        if (!r.ok) throw new Error('config');
        _siteConfigCache = await r.json();
    } catch {
        _siteConfigCache = {
            stripePublishableKey: '',
            stripeCheckoutApiUrl: DEFAULT_CHECKOUT_API_URL,
        };
    }
    if (_siteConfigCache.stripePublishableKey) {
        window.__CREED_STRIPE_PUBLISHABLE_KEY = _siteConfigCache.stripePublishableKey;
    }
    return _siteConfigCache;
}

/* Customers-served figure, shared with the homepage hero counter via
       window.creedOrdersCompleted (script.js). These strings used to be
       hardcoded as "7,700+" and drifted out of step as the hero climbed. */
    function creedOrdersLabel() {
        var n = (typeof window.creedOrdersCompleted === 'function')
            ? window.creedOrdersCompleted()
            : (window.CREED_ORDERS ? window.CREED_ORDERS.base : 7726);
        return n.toLocaleString('en-US');
    }

class Cart {
    constructor() {
        this.items = this.loadCart();
        this.discountCode = null;
        this.discountPercent = 0;
        this.addons = [
            {
                id: 'installation-service',
                name: 'Installation Service',
                variant: 'One-Time Setup',
                price: 9.95,
                image: 'creedlogo.png',
                description: 'Our support team helps you get installed correctly.',
                badge: 'Recommended',
            },
            {
                id: 'temp-spoofer',
                name: 'Temporary Spoofer',
                variant: 'Add-on Protection',
                price: 19.65,
                image: 'tempspoofer.png',
                description: 'Extra HWID protection for risky setups.',
                badge: 'Popular',
            },
            {
                id: 'fortnite-skins', name: 'Fortnite Skin Account', variant: 'Account', price: 2.99,
                image: 'fortniteskins-product.png', description: 'Hand-checked Fortnite account with rare and OG skins.', badge: 'Game account',
                slug: '/product/fortnite-skins'
            },
            {
                id: 'valorant-skins', name: 'Valorant Skin Account', variant: 'Account', price: 4.99,
                image: 'valorantskins-product.png', description: 'Valorant account with premium bundles and skins.', badge: 'Game account',
                slug: '/product/valorant-skins'
            },
            {
                id: 'apex-skins', name: 'Apex Legends Skin Account', variant: 'Account', price: 1.99,
                image: 'apexskins-product.png', description: 'Apex account loaded with legendary skins and cosmetics.', badge: 'Game account',
                slug: '/product/apex-skins'
            },
            {
                id: 'rainbow-six-skins', name: 'Rainbow Six Skin Account', variant: 'Account', price: 3.99,
                image: 'rainbowsixskins-product.png', description: 'Rainbow Six Siege account with elite sets and Black Ice.', badge: 'Game account',
                slug: '/product/rainbowsiege-skins'
            },
            {
                id: 'warzone-skins', name: 'Warzone Skin Account', variant: 'Account', price: 2.49,
                image: 'warzoneskins-product.png', description: 'Warzone account with operator skins and blueprints.', badge: 'Game account',
                slug: '/product/warzone-skins'
            },
        ];
        this.init();
    }

    init() {
        this.updateCartUI();
        this.setupEventListeners();
        this.initProductPageConversionWidgets();
    }

    loadCart() {
        try {
            const cartData = localStorage.getItem('creed_cart');
            const items = cartData ? JSON.parse(cartData).map((item) => this.normalizeCartItem(item)) : [];
            
            // Load discount code from localStorage
            const savedDiscountCode = localStorage.getItem('creed_discount_code');
            if (savedDiscountCode) {
                const validation = this.validateCouponCodeSync(savedDiscountCode);
                if (validation.valid) {
                    this.discountCode = validation.code;
                    this.discountPercent = validation.percent;
                } else if (typeof window.creedValidateDiscount === 'function') {
                    window.creedValidateDiscount(savedDiscountCode).then((remote) => {
                        if (!remote.valid) return;
                        this.discountCode = remote.code;
                        this.discountPercent = remote.percent;
                        this.saveCart();
                    });
                }
            }
            
            return items;
        } catch (e) {
            console.error('Error loading cart:', e);
            return [];
        }
    }

    saveCart() {
        try {
            this.items = this.items.map((item) => this.normalizeCartItem(item));
            localStorage.setItem('creed_cart', JSON.stringify(this.items));
            
            // Save discount code
            if (this.discountCode) {
                localStorage.setItem('creed_discount_code', this.discountCode);
            } else {
                localStorage.removeItem('creed_discount_code');
            }
            
            this.updateCartUI();
        } catch (e) {
            console.error('Error saving cart:', e);
        }
    }

    addItem(product) {
        product = this.normalizeCartItem(product);
        // product: { id, name, variant, price, quantity, image, slug }
        const existingIndex = this.items.findIndex(
            item => item.id === product.id && item.variant === product.variant
        );

        if (existingIndex > -1) {
            // Update quantity if same product and variant exists
            this.items[existingIndex].quantity += product.quantity;
        } else {
            // Add new item
            this.items.push({ ...product });
        }

        this.saveCart();
        this.showCartNotification();
    }

    normalizeCartItem(item) {
        if (!item || typeof item !== 'object') return item;

        if (item.id === 'rainbow-six' && item.image === 'rainbow6product.jpg') {
            return { ...item, image: 'rainbow6product.png' };
        }

        return item;
    }

    removeItem(index) {
        this.items.splice(index, 1);
        this.saveCart();
    }

    updateQuantity(index, quantity) {
        if (quantity <= 0) {
            this.removeItem(index);
            return;
        }
        this.items[index].quantity = quantity;
        this.saveCart();
    }

    clearCart() {
        this.items = [];
        this.discountCode = null;
        this.discountPercent = 0;
        this.saveCart();
    }

    addAddon(addonId) {
        const addon = this.addons.find((item) => item.id === addonId);
        if (!addon) return;

        this.addItem({
            id: addon.id,
            name: addon.name,
            variant: addon.variant,
            price: addon.price,
            quantity: 1,
            image: addon.image,
            slug: addon.slug || (addon.id === 'temp-spoofer' ? '/product/temp-spoofer' : '/support'),
            addon: true,
        });
    }

    getRelevantAddons() {
        const productIds = this.items.map(item => item.id);
        const accountIds = new Set();
        productIds.forEach(id => {
            const accountId = Cart.accountForProduct[id];
            if (accountId) accountIds.add(accountId);
        });
        const gameAccounts = this.addons.filter(addon => accountIds.has(addon.id));
        return this.addons.filter(addon => !addon.id.endsWith('-skins')).concat(gameAccounts);
    }

    getTotal() {
        return this.items.reduce((total, item) => {
            return total + (parseFloat(item.price) * item.quantity);
        }, 0);
    }

    getDiscountAmount() {
        const subtotal = this.getTotal();
        return subtotal * (this.discountPercent / 100);
    }

    getDiscountedTotal() {
        const subtotal = this.getTotal();
        const discount = this.getDiscountAmount();
        return Math.max(0, subtotal - discount);
    }

    validateCouponCodeSync(code) {
        if (!code) return { valid: false, percent: 0 };
        
        const upperCode = code.toUpperCase().trim();
        const validCodes = {
            'CREED5': 5,
            'CREED10': 10,
            'CREED20': 20,
            'CREEDEM20': 20,
            'CREEDFLASH': 40,
            'ACE5': 5,
            'ACE10': 10,
            'ACE15': 15,
        };

        if (validCodes[upperCode]) {
            return { valid: true, percent: validCodes[upperCode], code: upperCode };
        }
        
        return { valid: false, percent: 0 };
    }

    async validateCouponCode(code) {
        const local = this.validateCouponCodeSync(code);
        if (local.valid) return local;
        if (typeof window.creedValidateDiscount === 'function') {
            return window.creedValidateDiscount(code);
        }
        return { valid: false, percent: 0 };
    }

    async applyCouponCode(code) {
        const validation = await this.validateCouponCode(code);
        
        if (validation.valid) {
            this.discountCode = validation.code;
            this.discountPercent = validation.percent;
            this.saveCart();
            this.renderCartModal();
            if (typeof window.creedTrack === 'function') {
                window.creedTrack('discount', { code: validation.code, percent: validation.percent });
            }
            return { success: true, message: `Coupon "${validation.code}" applied! ${validation.percent}% discount.` };
        } else {
            this.discountCode = null;
            this.discountPercent = 0;
            this.saveCart();
            this.renderCartModal();
            return { success: false, message: 'Invalid coupon code. Please try again.' };
        }
    }

    removeCouponCode() {
        this.discountCode = null;
        this.discountPercent = 0;
        this.saveCart();
        this.renderCartModal();
    }

    getItemCount() {
        return this.items.reduce((count, item) => count + item.quantity, 0);
    }

    snapshotOrderForAnalytics(extra = {}) {
        try {
            const snapshot = {
                items: (this.items || []).map(item => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity || 1,
                    variant: item.variant || '',
                })),
                total: this.getDiscountedTotal(),
                discountCode: this.discountCode || '',
                referralCode: this.getReferralCode() || '',
                youtube: (typeof window.getCreedYoutube === 'function' && window.getCreedYoutube()) || '',
                tiktok: (typeof window.getCreedTiktok === 'function' && window.getCreedTiktok()) || '',
                campaign: (typeof window.getCreedEmailCampaign === 'function' && window.getCreedEmailCampaign()) || '',
                email: extra.email || '',
                customerId: typeof window.creedCustomerId === 'function' ? window.creedCustomerId() : '',
                orderId: extra.orderId || '',
                paymentMethod: extra.paymentMethod || '',
                sessionId: extra.sessionId || '',
                ts: Date.now(),
            };
            localStorage.setItem('creed_umami_order', JSON.stringify(snapshot));
        } catch (e) { /* ignore */ }
    }

    saveOrderInvoice(payload = {}) {
        if (typeof window.creedSaveOrder !== 'function') return Promise.resolve({ success: false });
        return window.creedSaveOrder({
            orderId: payload.orderId || '',
            email: payload.email || '',
            status: payload.status || 'pending',
            amount: payload.amount != null ? payload.amount : this.getDiscountedTotal(),
            currency: 'USD',
            paymentMethod: payload.paymentMethod || '',
            sessionId: payload.sessionId || '',
            items: (this.items || []).map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity || 1,
                variant: item.variant || '',
            })),
            paidAt: payload.status === 'completed' ? new Date().toISOString() : '',
        });
    }

    getScarcityState(seed = 'cart') {
        const key = `creed_scarcity_${seed}`;
        const now = Date.now();
        let state = null;

        try {
            state = JSON.parse(sessionStorage.getItem(key) || 'null');
        } catch {
            state = null;
        }

        if (!state || !state.expiresAt || state.expiresAt <= now) {
            const sold = 86 + Math.floor(Math.random() * 8);
            const stock = 3 + Math.floor(Math.random() * 6);
            const minutes = 8 + Math.floor(Math.random() * 12);
            state = {
                sold,
                stock,
                expiresAt: now + minutes * 60 * 1000,
            };
            try {
                sessionStorage.setItem(key, JSON.stringify(state));
            } catch {
                /* ignore */
            }
        }

        const ms = Math.max(0, state.expiresAt - now);
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        return {
            ...state,
            timer: `00:${minutes}:${seconds}`,
        };
    }

    updateCartUI() {
        const cartCount = this.getItemCount();
        const cartBadge = document.getElementById('cart-badge');
        if (cartBadge) {
            cartBadge.textContent = cartCount;
            cartBadge.style.display = cartCount > 0 ? 'flex' : 'none';
        }

        document.querySelectorAll('.cart-count-inline').forEach((el) => {
            el.textContent = cartCount;
        });

        // Update cart modal if open
        const cartModal = document.getElementById('cart-modal');
        if (cartModal && cartModal.classList.contains('active')) {
            this.renderCartModal();
        }
    }

    showCartNotification() {
        // Show a brief notification that item was added
        const notification = document.createElement('div');
        notification.className = 'cart-notification';
        notification.textContent = 'Added to cart!';
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    renderCartModal() {
        const cartItemsContainer = document.getElementById('cart-items');
        const cartTotal = document.getElementById('cart-total');
        const cartEmpty = document.getElementById('cart-empty');
        const cartContent = document.getElementById('cart-content');

        if (!cartItemsContainer || !cartTotal) return;

        if (this.items.length === 0) {
            if (cartEmpty) cartEmpty.style.display = 'block';
            if (cartContent) cartContent.style.display = 'none';
            return;
        }

        if (cartEmpty) cartEmpty.style.display = 'none';
        if (cartContent) cartContent.style.display = 'block';

        const header = document.querySelector('.cart-header h2');
        if (header) {
            header.innerHTML = `Your Cart <span class="cart-count-pill cart-count-inline">${this.getItemCount()}</span>`;
        }

        const subtotal = this.getTotal();
        const discount = this.getDiscountAmount();
        const total = this.getDiscountedTotal();
        const unavailableAddonIds = new Set(this.items.map((item) => item.id));

        cartItemsContainer.innerHTML = `
            <div class="cart-social-proof">
                <div class="cart-avatar-stack" aria-hidden="true">
                    <img src="https://i.pravatar.cc/64?img=12" alt="">
                    <img src="https://i.pravatar.cc/64?img=32" alt="">
                    <img src="https://i.pravatar.cc/64?img=47" alt="">
                    <img src="https://i.pravatar.cc/64?img=56" alt="">
                </div>
                <div>
                    <strong>${creedOrdersLabel()}+ others have purchased</strong>
                    <span>Instant access, verified vouches, 24/7 support.</span>
                </div>
            </div>

            <div class="cart-items-list">
                ${this.items.map((item, index) => `
            <div class="cart-item">
                <img src="/assets/${item.image}" alt="${item.name}" class="cart-item-image">
                <div class="cart-item-details">
                    <h4 class="cart-item-name">${item.name}</h4>
                    <p class="cart-item-variant">${item.variant}</p>
                    <p class="cart-item-price">$${parseFloat(item.price).toFixed(2)}</p>
                </div>
                <div class="cart-item-controls">
                    <div class="cart-quantity-controls">
                        <button class="cart-quantity-btn" onclick="cart.updateQuantity(${index}, ${item.quantity - 1})">-</button>
                        <span class="cart-quantity">${item.quantity}</span>
                        <button class="cart-quantity-btn" onclick="cart.updateQuantity(${index}, ${item.quantity + 1})">+</button>
                    </div>
                    <button class="cart-remove-btn" onclick="cart.removeItem(${index})">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
                <div class="cart-item-total">
                    $${(parseFloat(item.price) * item.quantity).toFixed(2)}
                </div>
            </div>
                `).join('')}
            </div>

            <div class="cart-addon-section">
                <div class="cart-addon-title">
                    <i class="fas fa-bolt"></i>
                    Exclusive offers to pair with your cheats
                </div>
                <div class="cart-addon-list">
                    ${this.getRelevantAddons().map((addon) => {
                        const added = unavailableAddonIds.has(addon.id);
                        return `
                            <button class="cart-addon-card ${added ? 'added' : ''}" onclick="cart.addAddon('${addon.id}')" ${added ? 'disabled' : ''}>
                                <img src="/assets/${addon.image}" alt="${addon.name}">
                                <span class="cart-addon-copy">
                                    <strong>${addon.name} <em>${addon.badge}</em></strong>
                                    <small>${addon.description}</small>
                                </span>
                                <span class="cart-addon-price">${added ? 'Added' : `+$${addon.price.toFixed(2)}`}</span>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // Update totals with discount
        const subtotalEl = document.getElementById('cart-subtotal');
        const subtotalAmountEl = document.getElementById('cart-subtotal-amount');
        const discountEl = document.getElementById('cart-discount');
        const discountAmountEl = document.getElementById('cart-discount-amount');
        const couponInput = document.getElementById('coupon-code-input');
        
        if (this.discountPercent > 0) {
            // Show subtotal and discount
            if (subtotalEl) {
                subtotalEl.style.display = 'flex';
                subtotalAmountEl.textContent = `$${subtotal.toFixed(2)}`;
            }
            if (discountEl) {
                discountEl.style.display = 'flex';
                discountAmountEl.textContent = `-$${discount.toFixed(2)}`;
            }
            if (couponInput) {
                couponInput.value = this.discountCode;
                couponInput.disabled = true;
            }
            cartTotal.textContent = `$${total.toFixed(2)}`;
        } else {
            // Hide subtotal and discount
            if (subtotalEl) subtotalEl.style.display = 'none';
            if (discountEl) discountEl.style.display = 'none';
            if (couponInput) {
                couponInput.value = '';
                couponInput.disabled = false;
            }
            cartTotal.textContent = `$${subtotal.toFixed(2)}`;
        }

        const checkoutBtn = document.getElementById('cart-checkout');
        if (checkoutBtn) {
            checkoutBtn.innerHTML = '<i class="fas fa-lock"></i> Secure Checkout';
        }
    }

    initProductPageConversionWidgets() {
        const productPage = document.querySelector('.product-detail-page');
        const variants = document.querySelector('.product-variants-section');
        const totalSection = document.querySelector('.product-total-section');
        const addButton = document.getElementById('add-to-cart-btn');

        if (!productPage || !variants || !totalSection || document.querySelector('.product-urgency-stack')) return;

        const urgency = document.createElement('div');
        urgency.className = 'product-urgency-stack';
        const pageProductId = this.getCurrentProductId();
        const accountAddon = pageProductId && Cart.accountForProduct[pageProductId]
            ? this.addons.find(addon => addon.id === Cart.accountForProduct[pageProductId])
            : null;
        urgency.innerHTML = `
            <div class="product-trust-proof">
                <div class="cart-avatar-stack" aria-hidden="true">
                    <img src="https://i.pravatar.cc/64?img=5" alt="">
                    <img src="https://i.pravatar.cc/64?img=18" alt="">
                    <img src="https://i.pravatar.cc/64?img=29" alt="">
                </div>
                <span><strong>${creedOrdersLabel()}+ customers</strong> bought from Creed — instant delivery after payment.</span>
            </div>
            <div class="product-addon-mini">
                <div class="product-addon-mini-copy">
                    <strong>Recommended add-ons</strong>
                    <span>${accountAddon ? `Pair it with a ${accountAddon.name}, setup help, or HWID protection.` : 'Pair your cheat with setup help or HWID protection.'}</span>
                </div>
                <div class="product-addon-mini-actions">
                    ${accountAddon ? `<button type="button" onclick="cart.addAddon('${accountAddon.id}')">+ ${accountAddon.name.replace(' Skin Account', ' Account')} $${accountAddon.price.toFixed(2)}</button>` : ''}
                    <button type="button" onclick="cart.addAddon('installation-service')">+ Setup $9.95</button>
                    <button type="button" onclick="cart.addAddon('temp-spoofer')">+ Spoofer $19.65</button>
                </div>
            </div>
        `;
        // Placed AFTER the buy panel, not between variants and it. Injecting
        // here pushed Add to Cart a full screen down, so customers had to
        // scroll past social proof and add-on upsells to reach the button.
        // Add-ons also convert better once the price has been seen.
        totalSection.insertAdjacentElement('afterend', urgency);

        // "BASE PRICE" and "TOTAL" always showed the same number, so the page
        // spent ~150px saying it twice. Move the quantity stepper into the buy
        // panel and drop the duplicate block. Moving the node (rather than
        // cloning) keeps its existing listeners intact.
        const priceSection = document.querySelector('.product-price-section');
        const qty = priceSection && priceSection.querySelector('.quantity-selector');
        const totalDisplay = totalSection.querySelector('.total-display');
        if (qty && totalDisplay && !totalSection.querySelector('.quantity-selector')) {
            totalDisplay.insertAdjacentElement('afterend', qty);
            totalSection.classList.add('has-qty');
            // Hidden, NOT removed. Each product page's inline script does
            // getElementById('base-price') - which lives inside this block - and
            // writes to it on every variant click. cart.js runs first, so
            // removing the node made that lookup return null and threw on the
            // first variant click, breaking variant selection site-wide.
            priceSection.style.display = 'none';
        }

        totalSection.classList.add('product-total-section-converting');
    }

    getCurrentProductId() {
        const path = location.pathname.replace(/\/$/, '');
        const match = path.match(/product-([^/]+)\.html$/);
        if (match) return match[1];

        // Vercel rewrites the customer-facing product URLs to the HTML files,
        // so location.pathname is usually /product/fortnite rather than the
        // underlying /product-fortnite-public.html filename.
        const prettyProductIds = {
            '/product/fortnite': 'fortnite-public',
            '/product/rainbowsiege': 'rainbow-six',
            '/product/rainbow-six': 'rainbow-six',
        };
        return prettyProductIds[path] || (path.match(/^\/product\/([^/]+)$/) || [])[1] || null;
    }

    setupEventListeners() {
        // Cart icon click
        const cartIcon = document.getElementById('cart-icon');
        if (cartIcon) {
            cartIcon.addEventListener('click', () => this.toggleCart());
        }

        // Close cart button
        const closeCart = document.getElementById('close-cart');
        if (closeCart) {
            closeCart.addEventListener('click', () => this.closeCart());
        }

        // Cart overlay click
        const cartOverlay = document.getElementById('cart-overlay');
        if (cartOverlay) {
            cartOverlay.addEventListener('click', () => this.closeCart());
        }

        // Checkout button
        const checkoutBtn = document.getElementById('cart-checkout');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', () => this.showCheckoutForm());
        }

        // Apply coupon button
        const applyCouponBtn = document.getElementById('apply-coupon-btn');
        if (applyCouponBtn) {
            applyCouponBtn.addEventListener('click', () => this.handleApplyCoupon());
        }

        // Coupon input enter key
        const couponInput = document.getElementById('coupon-code-input');
        if (couponInput) {
            couponInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleApplyCoupon();
                }
            });
        }
    }

    toggleCart() {
        const cartModal = document.getElementById('cart-modal');
        if (cartModal) {
            cartModal.classList.toggle('active');
            if (cartModal.classList.contains('active')) {
                this.renderCartModal();
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        }
    }

    closeCart() {
        const cartModal = document.getElementById('cart-modal');
        if (cartModal) {
            cartModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    async handleApplyCoupon() {
        const couponInput = document.getElementById('coupon-code-input');
        const couponMessage = document.getElementById('coupon-message');
        
        if (!couponInput) return;
        
        const code = couponInput.value.trim();
        
        if (!code) {
            if (couponMessage) {
                couponMessage.textContent = 'Please enter a coupon code';
                couponMessage.className = 'coupon-message error';
                setTimeout(() => {
                    couponMessage.textContent = '';
                    couponMessage.className = 'coupon-message';
                }, 3000);
            }
            return;
        }

        const result = await this.applyCouponCode(code);
        
        if (couponMessage) {
            couponMessage.textContent = result.message;
            couponMessage.className = `coupon-message ${result.success ? 'success' : 'error'}`;
            setTimeout(() => {
                couponMessage.textContent = '';
                couponMessage.className = 'coupon-message';
            }, 3000);
        }
    }

    showCheckoutForm() {
        // Check if form already exists
        let formModal = document.getElementById('checkout-form-modal');
        if (formModal) {
            formModal.classList.add('active');
            return;
        }

        // Create checkout form modal
        formModal = document.createElement('div');
        formModal.id = 'checkout-form-modal';
        formModal.className = 'checkout-form-modal';
        formModal.innerHTML = `
            <div class="checkout-form-overlay"></div>
            <div class="checkout-form-content glass-panel">
                <div class="checkout-banner">
                    <img src="/assets/creedv2banner.png" alt="" aria-hidden="true">
                    <div class="checkout-banner-fade"></div>
                    <button id="close-checkout-form" class="checkout-form-close" aria-label="Close">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="checkout-form-header">
                    <h2>Complete Your Order</h2>
                </div>
                <form id="checkout-form">
                    <!-- Order summary: you couldn't see what you were paying for before -->
                    <div class="checkout-summary">
                        <div class="checkout-summary-head">
                            <span>Order summary</span>
                            <span>${this.items.reduce((n, i) => n + (i.quantity || 1), 0)} item${this.items.reduce((n, i) => n + (i.quantity || 1), 0) === 1 ? '' : 's'}</span>
                        </div>
                        <ul class="checkout-summary-items">
                            ${this.items.map(i => `
                                <li>
                                    <span class="cs-name">${i.name}<em>${i.variant || ''}</em></span>
                                    <span class="cs-qty">×${i.quantity || 1}</span>
                                    <span class="cs-price">$${(i.price * (i.quantity || 1)).toFixed(2)}</span>
                                </li>`).join('')}
                        </ul>
                        ${this.discountCode ? `
                        <div class="checkout-summary-row is-discount">
                            <span><i class="fas fa-tag"></i> ${this.discountCode} (−${this.discountPercent}%)</span>
                            <span>−$${this.getDiscountAmount().toFixed(2)}</span>
                        </div>` : ''}
                        <div class="checkout-summary-total">
                            <span>Total</span>
                            <strong>$${this.getDiscountedTotal().toFixed(2)} <em>USD</em></strong>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="checkout-email">Email Address *</label>
                        <input type="email" id="checkout-email" name="email" required
                               placeholder="your@email.com" autocomplete="email" inputmode="email">
                        <small>We'll send your key and receipt here</small>
                    </div>
                    <div class="form-group">
                        <label for="checkout-discord">Discord Username *</label>
                        <input type="text" id="checkout-discord" name="discord" required
                               placeholder="username" autocomplete="off">
                        <small>So we can reach you for support and product access</small>
                    </div>
                    <div class="form-group">
                        <label>Payment Method *</label>
                        <div class="payment-methods">
                            <!-- Populated by refreshWalletOption() only when the customer is
                                 signed in AND holds enough credit. Purely a UI convenience:
                                 /api/wallet-purchase re-verifies identity, price and balance
                                 server-side, so forcing this option into the DOM buys nothing. -->
                            <div id="wallet-pay-slot"></div>
                            <label class="payment-method-option">
                                <input type="radio" name="payment-method" value="stripe" checked>
                                <div class="payment-method-card">
                                    <i class="fab fa-cc-stripe"></i>
                                    <span class="pm-text">
                                        <strong>Card or Wallet</strong>
                                        <em>Instant delivery — key issued automatically</em>
                                        <!-- The marks carry the message here, so the label stays
                                             short. Limited to what Stripe can actually offer in
                                             USD: Bancontact / EPS / Cartes Bancaires are EUR-only
                                             and Pay by Bank is GBP-only. -->
                                        <span class="pm-methods" data-accepted-payments data-heading="false"
                                              data-compact="true"
                                              data-only="visa,mastercard,amex,applepay,googlepay,klarna"></span>
                                    </span>
                                    <span class="pm-badge">Instant</span>
                                </div>
                            </label>
                            <label class="payment-method-option">
                                <input type="radio" name="payment-method" value="ltc">
                                <div class="payment-method-card">
                                    <span class="pm-text">
                                        <strong>Crypto / Litecoin</strong>
                                        <em>Live on-chain tracking and automatic delivery</em>
                                    </span>
                                    <span class="pm-badge">Tracked</span>
                                </div>
                            </label>
                            <label class="payment-method-option">
                                <input type="radio" name="payment-method" value="paypal">
                                <div class="payment-method-card">
                                    <span class="pm-text">
                                        <strong>PayPal</strong>
                                        <em>Opens a Discord ticket to complete payment</em>
                                    </span>
                                    <span class="pm-badge is-manual">Manual</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    <p id="checkout-error" class="checkout-error" role="alert" hidden></p>

                    <div class="form-actions">
                        <button type="button" id="cancel-checkout" class="btn btn-secondary">Cancel</button>
                        <button type="submit" id="submit-checkout" class="btn btn-primary">
                            <span class="sc-label">Pay $${this.getDiscountedTotal().toFixed(2)}</span>
                            <span class="sc-loading" hidden><i class="fas fa-circle-notch fa-spin"></i> Working…</span>
                        </button>
                    </div>

                    <div class="checkout-trust">
                        <span><i class="fas fa-lock"></i> Secure checkout</span>
                        <span><i class="fas fa-bolt"></i> Instant delivery</span>
                        <span><i class="fas fa-headset"></i> 24/7 support</span>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(formModal);

        // The modal is built after payment-badges.js has already run, so ask
        // it to fill the placeholder now that it exists in the DOM.
        if (window.CreedPaymentBadges) {
            window.CreedPaymentBadges.render();
        }

        this.refreshWalletOption();

        // Event listeners
        const overlay = formModal.querySelector('.checkout-form-overlay');
        const closeBtn = formModal.querySelector('#close-checkout-form');
        const cancelBtn = formModal.querySelector('#cancel-checkout');
        const form = formModal.querySelector('#checkout-form');

        const closeModal = () => {
            formModal.classList.remove('active');
        };

        overlay.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('checkout-email').value.trim();
            const discord = document.getElementById('checkout-discord').value.trim();
            const paymentMethod = document.querySelector('input[name="payment-method"]:checked')?.value;
            const errEl = document.getElementById('checkout-error');
            const submitBtn = document.getElementById('submit-checkout');

            // Inline errors instead of a browser alert()
            const fail = (msg, focusId) => {
                if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
                if (focusId) document.getElementById(focusId)?.focus();
            };
            if (errEl) errEl.hidden = true;

            if (!email) return fail('Please enter your email address.', 'checkout-email');
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('That email address doesn’t look right.', 'checkout-email');
            if (!discord) return fail('Please enter your Discord username.', 'checkout-discord');
            if (!paymentMethod) return fail('Please choose a payment method.');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.querySelector('.sc-label')?.setAttribute('hidden', '');
                submitBtn.querySelector('.sc-loading')?.removeAttribute('hidden');
            }

            formModal.classList.remove('active');
            if (typeof window.creedSaveEmail === 'function') {
                window.creedSaveEmail({ kind: 'customer', email: email, source: 'checkout' });
            }
            this.processCheckout(email, discord, paymentMethod);
        });

        // Show modal
        setTimeout(() => formModal.classList.add('active'), 10);
    }

    getReferralCode() {
        // Prefer the helper exposed by script.js; fall back to reading storage directly
        try {
            if (typeof window.getCreedReferral === 'function') return window.getCreedReferral();
            const stored = JSON.parse(localStorage.getItem('creed_ref') || 'null');
            if (!stored || !stored.code) return null;
            if (Date.now() - (stored.ts || 0) > 30 * 24 * 60 * 60 * 1000) return null;
            return stored.code;
        } catch (e) {
            return null;
        }
    }

    /**
     * Offer "pay with credits" only when the customer is signed in and their
     * balance covers the cart. Insufficient balance is shown as a disabled
     * hint rather than hidden, so people know the credits exist.
     */
    refreshWalletOption() {
        const slot = document.getElementById('wallet-pay-slot');
        if (!slot || !window.CreedWallet) return;

        const balanceCents = window.CreedWallet.balanceCents();
        const totalCents = Math.round(this.getDiscountedTotal() * 100);

        if (!window.CreedWallet.isSignedIn()) { slot.innerHTML = ''; return; }

        const enough = balanceCents >= totalCents;
        const balance = `$${(balanceCents / 100).toFixed(2)}`;

        slot.innerHTML = `
            <label class="payment-method-option${enough ? '' : ' is-disabled'}">
                <input type="radio" name="payment-method" value="wallet" ${enough ? '' : 'disabled'}>
                <div class="payment-method-card">
                    <i class="fas fa-wallet"></i>
                    <span class="pm-text">
                        <strong>Creed Credits</strong>
                        <em>${enough
                            ? `Balance ${balance} — paid instantly, no card needed`
                            : `Balance ${balance} — not enough for this order`}</em>
                    </span>
                    <span class="pm-badge">${enough ? 'Instant' : 'Low'}</span>
                </div>
            </label>`;
    }

    /**
     * Pay from wallet credits. Everything that matters is decided server-side:
     * the access token identifies the buyer, the cart is re-priced from the
     * server catalog, and the balance check plus debit happen atomically in
     * one database statement. Nothing here is trusted.
     */
    async processWalletCheckout(discordUsername, userEmail) {
        const token = window.CreedWallet ? await window.CreedWallet.token() : null;
        if (!token) throw new Error('Your session expired. Sign in again.');

        const response = await fetch('/api/wallet-purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                items: this.items,
                discountCode: this.discountCode,
                discordUsername: discordUsername,
                referralCode: this.getReferralCode()
            })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Could not pay with credits');
        }

        this.snapshotOrderForAnalytics({
            email: userEmail || '',
            orderId: result.orderId || '',
            paymentMethod: 'wallet',
            sessionId: result.orderId || ''
        });
        if (typeof window.creedSaveEmail === 'function' && userEmail) {
            await window.creedSaveEmail({
                kind: 'customer',
                email: userEmail,
                source: 'checkout',
                orderId: result.orderId || ''
            });
        }
        await this.saveOrderInvoice({
            orderId: result.orderId || '',
            email: userEmail || '',
            status: 'completed',
            paymentMethod: 'wallet',
            sessionId: result.orderId || ''
        });
        this.items = [];
        this.saveCart();
        this.updateCartUI();
        if (window.CreedWallet) window.CreedWallet.refresh();

        // payment-success reads `session_id`; for wallet orders session_id and
        // order id are the same value, and the page routes non-'cs_' ids to
        // portal-claim-by-order.
        window.location.href = `/payment-success?session_id=${encodeURIComponent(result.orderId)}&paid=credits`;
    }

    async processCheckout(userEmail, discordUsername, paymentMethod) {
        if (this.items.length === 0) {
            alert('Your cart is empty!');
            return;
        }

        if (paymentMethod === 'wallet') {
            const checkoutBtn = document.getElementById('cart-checkout');
            try {
                await this.processWalletCheckout(discordUsername, userEmail);
            } catch (error) {
                alert(error.message || 'Could not pay with credits');
                if (checkoutBtn) { checkoutBtn.disabled = false; checkoutBtn.textContent = 'Checkout'; }
            }
            return;
        }

        try {
            // Show loading state
            const checkoutBtn = document.getElementById('cart-checkout');
            if (checkoutBtn) {
                checkoutBtn.disabled = true;
                checkoutBtn.textContent = 'Processing...';
            }

            // Create order payload with discount
            const orderData = {
                items: this.items,
                total: this.getDiscountedTotal(),
                subtotal: this.getTotal(),
                discountCode: this.discountCode,
                discountPercent: this.discountPercent,
                discountAmount: this.getDiscountAmount(),
                userEmail: userEmail,
                discordUsername: discordUsername,
                paymentMethod: paymentMethod,
                referralCode: this.getReferralCode(),
                timestamp: new Date().toISOString()
            };

            // Handle different payment methods
            if (paymentMethod === 'stripe') {
                const cfg = await loadPublicSiteConfig();
                const checkoutUrl =
                    (cfg.stripeCheckoutApiUrl && cfg.stripeCheckoutApiUrl.trim()) || DEFAULT_CHECKOUT_API_URL;
                const response = await fetch(checkoutUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(orderData)
                });

                if (!response.ok) {
                    throw new Error('Failed to create payment');
                }

                const data = await response.json();

                // Store session ID and order ID in localStorage before redirecting
                if (data.sessionId) {
                    localStorage.setItem('pending_order_session_id', data.sessionId);
                }
                if (data.orderId) {
                    localStorage.setItem('pending_order_id', data.orderId);
                }
                this.snapshotOrderForAnalytics({
                    email: userEmail,
                    orderId: data.orderId || '',
                    paymentMethod: 'stripe',
                    sessionId: data.sessionId || ''
                });
                if (typeof window.creedSaveEmail === 'function') {
                    await window.creedSaveEmail({
                        kind: 'customer',
                        email: userEmail,
                        source: 'checkout',
                        orderId: data.orderId || ''
                    });
                }
                await this.saveOrderInvoice({
                    orderId: data.orderId || '',
                    email: userEmail,
                    status: 'pending',
                    paymentMethod: 'stripe',
                    sessionId: data.sessionId || ''
                });

                // Redirect to Stripe payment page
                if (data.paymentUrl) {
                    window.location.href = data.paymentUrl;
                } else {
                    throw new Error('No payment URL received');
                }
            } else {
                // Handle manual payment methods (crypto / PayPal).
                // These orders stay pending. Keys are NOT delivered until staff verifies payment.
                const response = await fetch('/api/create-manual-payment', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(orderData)
                });

                if (!response.ok) {
                    throw new Error('Failed to create order');
                }

                const data = await response.json();

                // Store order ID for payment instructions page
                if (data.orderId) {
                    localStorage.setItem('pending_order_id', data.orderId);
                    localStorage.setItem('pending_payment_method', paymentMethod);
                }
                this.snapshotOrderForAnalytics({
                    email: userEmail,
                    orderId: data.orderId || '',
                    paymentMethod,
                    sessionId: data.sessionId || `manual_${paymentMethod}_${data.orderId || ''}`
                });
                if (typeof window.creedSaveEmail === 'function') {
                    await window.creedSaveEmail({
                        kind: 'customer',
                        email: userEmail,
                        source: 'checkout',
                        orderId: data.orderId || ''
                    });
                }
                await this.saveOrderInvoice({
                    orderId: data.orderId || '',
                    email: userEmail,
                    status: 'pending',
                    paymentMethod,
                    sessionId: data.sessionId || `manual_${paymentMethod}_${data.orderId || ''}`
                });

                // Show payment instructions page
                this.showPaymentInstructions(data, paymentMethod);
            }

        } catch (error) {
            console.error('Checkout error:', error);
            const detail = error && (error.message || error.error || 'Unknown checkout error');
            const message = detail && String(detail).trim()
                ? `Checkout failed: ${detail}. If you used a promo code, confirm the code is valid or contact support.`
                : 'Error processing checkout. Please try again.';
            alert(message);

            // Reset button
            const checkoutBtn = document.getElementById('cart-checkout');
            if (checkoutBtn) {
                checkoutBtn.disabled = false;
                checkoutBtn.textContent = 'Proceed to Checkout';
            }
        }
    }

    showPaymentInstructions(orderData, paymentMethod) {
        // Create payment instructions modal
        let instructionsModal = document.getElementById('payment-instructions-modal');
        if (instructionsModal) {
            instructionsModal.remove();
        }

        instructionsModal = document.createElement('div');
        instructionsModal.id = 'payment-instructions-modal';
        instructionsModal.className = 'payment-instructions-modal';
        
        const total = this.getDiscountedTotal();
        const PAYPAL_EMAIL = 'jens.missiaen@gmail.com';
        
        let paymentDetails = '';
        let paymentTitle = '';
        
        if (paymentMethod === 'ltc') {
            const ltc = orderData.ltcPayment;
            if (!ltc?.trackerToken || !ltc?.address || !ltc?.amountLtc || !ltc?.expiresAt) {
                alert('The Litecoin payment tracker could not be opened. Please start a new checkout.');
                return;
            }
            const paymentUri = `litecoin:${ltc.address}?amount=${ltc.amountLtc}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(paymentUri)}`;
            paymentTitle = 'Pay with Litecoin';
            paymentDetails = `
                <section class="ltc-checkout-card" aria-labelledby="ltc-amount-heading">
                    <div class="ltc-pay-head">
                        <div>
                            <span id="ltc-amount-heading" class="ltc-eyebrow">Exact amount to pay</span>
                            <strong class="ltc-amount">${ltc.amountLtc} <small>LTC</small></strong>
                            <span class="ltc-fiat">$${Number(orderData.amount || total).toFixed(2)} USD locked for this checkout</span>
                        </div>
                        <span class="ltc-network"><img src="/assets/payment-methods/brands/litecoin.svg" alt=""> Litecoin network</span>
                    </div>
                    <div class="ltc-payment-grid">
                        <div>
                            <p class="ltc-scan-copy">Scan to pay</p>
                            <div class="ltc-qr-wrap">
                                <img class="ltc-qr" src="${qrUrl}" alt="Litecoin payment QR code">
                            </div>
                        </div>
                        <div class="ltc-transfer-details">
                            <div class="ltc-copy-field">
                                <span>Wallet address</span>
                                <div><code>${ltc.address}</code><button class="copy-btn" type="button" data-copy="${ltc.address}" aria-label="Copy Litecoin wallet address"><i class="fas fa-copy"></i> Copy</button></div>
                            </div>
                            <div class="ltc-copy-field">
                                <span>Transfer amount</span>
                                <div><code>${ltc.amountLtc} LTC</code><button class="copy-btn" type="button" data-copy="${ltc.amountLtc}" aria-label="Copy Litecoin amount"><i class="fas fa-copy"></i> Copy</button></div>
                            </div>
                        </div>
                    </div>
                    <div class="ltc-expiry"><span><i class="fas fa-clock"></i> Quote expires in</span><strong id="ltc-countdown">45:00</strong></div>
                </section>
                <section class="ltc-tracker" aria-labelledby="ltc-tracker-heading">
                    <div class="ltc-tracker-heading"><div><span class="ltc-eyebrow">Live payment tracker</span><h3 id="ltc-tracker-heading">Track your transaction</h3></div><span id="ltc-status-pill" class="ltc-status-pill awaiting">Awaiting payment</span></div>
                    <div class="ltc-progress" id="ltc-progress">
                        <div class="active" data-stage="awaiting"><i class="fas fa-wallet"></i><span>Send</span></div>
                        <div data-stage="detected"><i class="fas fa-satellite-dish"></i><span>Detected</span></div>
                        <div data-stage="confirming"><i class="fas fa-shield-halved"></i><span>Confirming</span></div>
                        <div data-stage="confirmed"><i class="fas fa-check"></i><span>Complete</span></div>
                    </div>
                    <label class="ltc-tx-label" for="ltc-txid">Already sent? Paste your transaction ID</label>
                    <div class="ltc-tx-form"><input id="ltc-txid" type="text" maxlength="64" autocomplete="off" spellcheck="false" placeholder="64-character Litecoin TXID"><button id="ltc-verify-btn" type="button"><span>Verify payment</span><i class="fas fa-arrow-right"></i></button></div>
                    <p id="ltc-tracker-message" class="ltc-tracker-message" aria-live="polite">Paste your TXID after sending. This page will track confirmations automatically.</p>
                    <a id="ltc-explorer-link" class="ltc-explorer-link" target="_blank" rel="noopener" hidden>View transaction on explorer <i class="fas fa-arrow-up-right-from-square"></i></a>
                </section>
            `;
        } else if (paymentMethod === 'paypal') {
            paymentTitle = 'Complete with PayPal';
            const orderRef = orderData.orderId || orderData.id;
            paymentDetails = `
                <div class="payment-instruction-step">
                    <h3><i class="fas fa-dollar-sign"></i> Send Exactly:</h3>
                    <div class="payment-info-box">
                        <code class="crypto-address">$${total.toFixed(2)} USD</code>
                        <button class="copy-btn" type="button" data-copy="${total.toFixed(2)}">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>
                <div class="payment-instruction-step">
                    <h3><i class="fab fa-paypal"></i> PayPal Email:</h3>
                    <div class="payment-info-box">
                        <code class="crypto-address">${PAYPAL_EMAIL}</code>
                        <button class="copy-btn" type="button" data-copy="${PAYPAL_EMAIL}">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                </div>
                <div class="payment-instruction-step">
                    <h3><i class="fas fa-note-sticky"></i> Send as Friends &amp; Family</h3>
                    <div class="payment-info-box">
                        <strong>Add this to the payment note:</strong>
                        <code class="crypto-address">${orderRef}</code>
                        <button class="copy-btn" type="button" data-copy="${orderRef}">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                        <small>Send as <strong>Friends &amp; Family</strong> and put the Order ID in the note so staff can match your payment.</small>
                    </div>
                </div>

                <div class="payment-instruction-step" id="paypal-sent-step">
                    <button type="button" id="paypal-sent-btn" class="btn btn-primary paypal-sent-btn">
                        <i class="fas fa-check"></i> I've sent the payment
                    </button>
                </div>

                <!-- Revealed after the customer confirms they have paid. -->
                <div class="payment-instruction-step payment-sent-confirm" id="paypal-sent-confirm" hidden>
                    <h3><i class="fab fa-discord"></i> Now open a ticket to verify</h3>
                    <div class="payment-info-box">
                        <strong>Open a Discord ticket so staff can verify your payment.</strong>
                        <small>Paste your Order ID <strong>${orderRef}</strong> in the ticket. Your products are released once payment is confirmed.</small>
                    </div>
                    <a href="https://discord.gg/creedgg" target="_blank" rel="noopener" class="btn btn-primary paypal-ticket-btn">
                        <i class="fab fa-discord"></i> Open a ticket
                    </a>
                </div>

                <div class="payment-instruction-step">
                    <h3><i class="fas fa-info-circle"></i> Important:</h3>
                    <div class="payment-warning-box">
                        <p>Send the exact amount shown above</p>
                        <p>Must be sent as Friends &amp; Family with the Order ID in the note</p>
                        <p>Your order stays pending until staff manually verifies the payment</p>
                        <p>License keys are not delivered automatically for PayPal orders</p>
                    </div>
                </div>
            `;
        }
        
        instructionsModal.innerHTML = `
            <div class="payment-instructions-overlay"></div>
            <div class="payment-instructions-content glass-panel ${paymentMethod === 'ltc' ? 'is-ltc' : 'is-paypal'}" role="dialog" aria-modal="true" aria-labelledby="payment-instructions-title">
                <div class="payment-instructions-header">
                    <span class="payment-secure-label"><i class="fas fa-lock"></i> Secure checkout</span>
                    <h2 id="payment-instructions-title">${paymentTitle}</h2>
                    <p>${paymentMethod === 'ltc' ? 'Send the exact amount, then track its network confirmations here.' : 'Follow the steps below and keep your Order ID for verification.'}</p>
                    <button id="close-payment-instructions" class="payment-instructions-close" aria-label="Close payment instructions">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="payment-instructions-body">
                    <div class="order-id-display">
                        <p>Order ID: <strong>${orderData.orderId || orderData.id}</strong></p>
                    </div>
                    ${paymentDetails}
                    <div class="payment-instruction-step" ${paymentMethod === 'ltc' ? 'hidden' : ''}>
                        <h3><i class="fas fa-clock"></i> What Happens Next:</h3>
                        <ol class="payment-steps-list">
                            <li>${paymentMethod === 'paypal' ? 'Send the exact amount as Friends &amp; Family with your Order ID in the note' : 'Complete the payment using the instructions above'}</li>
                            <li>Keep your Order ID safe: <strong>${orderData.orderId || orderData.id}</strong></li>
                            <li>${paymentMethod === 'paypal' ? 'Press "I\'ve sent the payment", then open a Discord ticket to verify' : 'Join our Discord server and create a ticket with your Order ID'}</li>
                            <li>We'll manually verify your payment and activate your products</li>
                        </ol>
                    </div>
                </div>
                <div class="payment-instructions-footer">
                    ${paymentMethod === 'paypal' ? `<a href="https://discord.gg/creedgg" target="_blank" rel="noopener" class="btn btn-primary">
                        <i class="fab fa-discord"></i> Join Discord
                    </a>` : ''}
                    <button id="close-instructions-btn" class="btn btn-secondary">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(instructionsModal);
        
        // Event listeners
        const overlay = instructionsModal.querySelector('.payment-instructions-overlay');
        const closeBtn = instructionsModal.querySelector('#close-payment-instructions');
        const closeBtn2 = instructionsModal.querySelector('#close-instructions-btn');
        
        let ltcPollTimer = null;
        let ltcCountdownTimer = null;
        const stopLtcTimers = () => {
            if (ltcPollTimer) clearInterval(ltcPollTimer);
            if (ltcCountdownTimer) clearInterval(ltcCountdownTimer);
        };
        const handleModalKeydown = (event) => {
            if (event.key === 'Escape') closeModal();
        };
        const closeModal = () => {
            stopLtcTimers();
            document.removeEventListener('keydown', handleModalKeydown);
            instructionsModal.classList.remove('active');
            setTimeout(() => {
                instructionsModal.remove();
                // Clear cart after showing instructions
                this.clearCart();
            }, 300);
        };

        // Copy buttons (amount / PayPal email / order id). Uses data-copy
        // rather than inline onclick so a value containing a quote cannot
        // break out of the attribute.
        instructionsModal.querySelectorAll('.copy-btn[data-copy]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(btn.dataset.copy);
                    const original = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Copied';
                    setTimeout(() => { btn.innerHTML = original; }, 1400);
                } catch {
                    /* clipboard blocked - value is on screen to copy by hand */
                }
            });
        });

        // "I've sent the payment" reveals the verify-by-ticket step.
        const paypalSentBtn = instructionsModal.querySelector('#paypal-sent-btn');
        if (paypalSentBtn) {
            paypalSentBtn.addEventListener('click', () => {
                const confirmStep = instructionsModal.querySelector('#paypal-sent-confirm');
                const sentStep = instructionsModal.querySelector('#paypal-sent-step');
                if (confirmStep) {
                    confirmStep.hidden = false;
                    confirmStep.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                if (sentStep) sentStep.hidden = true;
            });
        }

        if (paymentMethod === 'ltc') {
            const tracker = orderData.ltcPayment;
            const txInput = instructionsModal.querySelector('#ltc-txid');
            const verifyBtn = instructionsModal.querySelector('#ltc-verify-btn');
            const message = instructionsModal.querySelector('#ltc-tracker-message');
            const statusPill = instructionsModal.querySelector('#ltc-status-pill');
            const explorer = instructionsModal.querySelector('#ltc-explorer-link');
            const countdown = instructionsModal.querySelector('#ltc-countdown');
            const stages = ['awaiting', 'detected', 'confirming', 'confirmed'];
            let trackedTxid = '';
            const paint = (data) => {
                const status = data.status || 'awaiting';
                const effective = status === 'underpaid' || status === 'expired' ? 'awaiting' : status;
                const current = Math.max(0, stages.indexOf(effective));
                instructionsModal.querySelectorAll('#ltc-progress [data-stage]').forEach((el, index) => {
                    el.classList.toggle('active', index <= current);
                    el.classList.toggle('current', index === current);
                });
                statusPill.className = `ltc-status-pill ${status}`;
                statusPill.textContent = status === 'confirming' ? `${data.confirmations || 1}/2 confirmations` : status === 'detected' ? 'Payment detected' : status === 'confirmed' ? 'Payment confirmed' : status === 'underpaid' ? 'Amount too low' : status === 'expired' ? 'Quote expired' : 'Awaiting payment';
                message.textContent = data.message || 'Checking Litecoin network…';
                message.classList.toggle('is-error', status === 'underpaid' || status === 'expired');
                if (data.txid) {
                    trackedTxid = data.txid;
                    txInput.value = data.txid;
                    txInput.readOnly = true;
                }
                if (data.explorerUrl) {
                    explorer.href = data.explorerUrl;
                    explorer.hidden = false;
                }
                if (status === 'confirmed' || status === 'expired' || status === 'underpaid') {
                    if (ltcPollTimer) clearInterval(ltcPollTimer);
                    ltcPollTimer = null;
                    verifyBtn.disabled = status === 'confirmed' || status === 'expired';
                    verifyBtn.querySelector('span').textContent = status === 'confirmed' ? 'Payment confirmed' : 'Check again';
                }
            };
            const verify = async (manual = false) => {
                const txid = String(txInput.value || trackedTxid).trim().toLowerCase();
                if (manual && !/^[a-f0-9]{64}$/i.test(txid)) {
                    message.textContent = 'Enter the full 64-character Litecoin transaction ID.';
                    message.classList.add('is-error');
                    txInput.focus();
                    return;
                }
                verifyBtn.disabled = true;
                verifyBtn.classList.add('loading');
                message.textContent = 'Checking the Litecoin network…';
                message.classList.remove('is-error');
                try {
                    const response = await fetch('/api/verify-ltc-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: orderData.orderId, trackerToken: tracker.trackerToken, ...(txid ? { txid } : {}) }) });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Could not verify payment');
                    paint(data);
                    if (data.txid && !ltcPollTimer && !['confirmed', 'expired', 'underpaid'].includes(data.status)) ltcPollTimer = setInterval(() => verify(false), 15000);
                } catch (error) {
                    message.textContent = error.message || 'Could not verify payment. Please try again.';
                    message.classList.add('is-error');
                } finally {
                    verifyBtn.classList.remove('loading');
                    if (!['confirmed', 'expired'].includes(statusPill.className.split(' ').pop())) verifyBtn.disabled = false;
                }
            };
            verifyBtn.addEventListener('click', () => verify(true));
            txInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') verify(true); });
            const updateCountdown = () => {
                const remaining = Math.max(0, new Date(tracker.expiresAt).getTime() - Date.now());
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                countdown.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                if (!remaining) { clearInterval(ltcCountdownTimer); verify(false); }
            };
            updateCountdown();
            ltcCountdownTimer = setInterval(updateCountdown, 1000);
        }

        overlay.addEventListener('click', closeModal);
        closeBtn.addEventListener('click', closeModal);
        closeBtn2.addEventListener('click', closeModal);
        document.addEventListener('keydown', handleModalKeydown);
        
        // Show modal
        setTimeout(() => {
            instructionsModal.classList.add('active');
            closeBtn.focus({ preventScroll: true });
        }, 10);
    }
}

// Only expose an account as an add-on when the matching game product is in
// the cart. This keeps unrelated accounts out of the offer list.
Cart.accountForProduct = Object.freeze({
    'fortnite-public': 'fortnite-skins',
    'fortnite-private': 'fortnite-skins',
    'valorant': 'valorant-skins',
    'apex-legends': 'apex-skins',
    'rainbow-six': 'rainbow-six-skins',
    'cod-black-ops-7': 'warzone-skins',
    'warzone': 'warzone-skins'
});

// Initialize cart when DOM is ready
let cart;
document.addEventListener('DOMContentLoaded', () => {
    loadPublicSiteConfig().catch(() => {});
    cart = new Cart();
    window.cart = cart; // Make it globally accessible for onclick handlers
    try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('discount') || params.get('code');
        if (code) cart.applyCouponCode(code);
    } catch (e) { /* ignore */ }
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Cart;
}
