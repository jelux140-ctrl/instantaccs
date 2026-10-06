/* =========================================
   CREED - PROMO POPUP
   Handles promo popup display and email collection
   ========================================= */

document.addEventListener('DOMContentLoaded', () => {
    const promoPopup = document.getElementById('promo-popup');
    let promoForm = document.getElementById('promo-popup-form');
    let promoEmailInput = document.getElementById('promo-email-input');
    const promoCloseBtn = document.getElementById('promo-popup-close');
    let promoDismissBtn = document.getElementById('promo-dismiss');
    const promoOverlay = promoPopup?.querySelector('.promo-popup-overlay');

    // Close popup function
    const closePopup = () => {
        if (promoPopup) {
            promoPopup.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    // Show discount code function
    const showDiscountCode = (code) => {
        const popupBody = promoPopup.querySelector('.promo-popup-body');
        if (!popupBody) return;

        popupBody.innerHTML = `
            <div class="discount-code-success">
                <div class="discount-success-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h2 class="discount-code-title">Your Discount Code</h2>
                <div class="discount-code-display">
                    <code class="discount-code-text">${code}</code>
                    <button class="discount-copy-btn" onclick="copyDiscountCode('${code}')">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                </div>
                <p class="discount-code-message">Use this code at checkout to get 5% OFF your order!</p>
                <button class="promo-dismiss" id="promo-dismiss-success">Close</button>
            </div>
        `;

        // Add event listener for close button
        const dismissBtn = document.getElementById('promo-dismiss-success');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', closePopup);
        }
    };

    // Copy discount code function (global for onclick)
    window.copyDiscountCode = (code) => {
        navigator.clipboard.writeText(code).then(() => {
            const copyBtn = document.querySelector('.discount-copy-btn');
            if (copyBtn) {
                const originalText = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                copyBtn.style.background = '#22c55e';
                setTimeout(() => {
                    copyBtn.innerHTML = originalText;
                    copyBtn.style.background = '';
                }, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy code. Please copy manually: ' + code);
        });
    };

    // Reset popup to original form function
    const resetPopupForm = () => {
        const popupBody = promoPopup.querySelector('.promo-popup-body');
        if (popupBody && popupBody.querySelector('.discount-code-success')) {
            // Restore original form HTML
            popupBody.innerHTML = `
                <h2 class="promo-popup-headline">
                    <span class="promo-text-line">YOU HAVE AN</span>
                    <span class="promo-text-exclusive">EXCLUSIVE</span>
                    <span class="promo-text-line">DISCOUNT !</span>
                </h2>
                <p class="promo-popup-subtext">Enter your email to receive your 5% OFF instantly</p>
                <form id="promo-popup-form" class="promo-popup-form">
                    <input 
                        type="email" 
                        id="promo-email-input" 
                        class="promo-email-input" 
                        placeholder="Email" 
                        required
                        autocomplete="email">
                    <button type="submit" class="promo-unlock-btn">
                        UNLOCK OFFER
                    </button>
                </form>
                <button class="promo-dismiss" id="promo-dismiss">No, thanks</button>
            `;
            
            // Re-get form elements
            promoForm = document.getElementById('promo-popup-form');
            promoEmailInput = document.getElementById('promo-email-input');
            promoDismissBtn = document.getElementById('promo-dismiss');
            
            // Re-attach form handler
            if (promoForm) {
                promoForm.addEventListener('submit', handleFormSubmit);
            }
            
            // Re-attach dismiss handler
            if (promoDismissBtn) {
                promoDismissBtn.addEventListener('click', closePopup);
            }
        }
    };

    // Form submission handler
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        
        const email = promoEmailInput.value.trim();
        
        if (!email || !email.includes('@')) {
            alert('Please enter a valid email address');
            return;
        }

        // Disable form during submission
        const submitBtn = promoForm.querySelector('.promo-unlock-btn');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'SENDING...';

        if (typeof window.creedTrack === 'function') {
            window.creedTrack('email_signup', {
                campaign: 'bonus-signup',
                email: email,
                discount: 'CREED5'
            });
        }

        if (typeof window.creedSaveEmail === 'function') {
            await window.creedSaveEmail({ kind: 'promo', email: email, source: 'popup' });
        }

        try {
            // Send email to API
            const response = await fetch('/api/send-promo-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: email })
            });

            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                // If response isn't JSON, still show discount code
                console.warn('Non-JSON response from email API:', parseError);
                data = { success: true }; // Assume success to show discount code
            }

            // Always show discount code - email sending is secondary
            // Even if email fails, user should get their discount code
            if (data.success !== false) {
                showDiscountCode('CREED5');
            } else {
                // If explicitly failed, still show code but log error
                console.error('Email API reported failure:', data.error);
                showDiscountCode('CREED5');
            }
        } catch (error) {
            console.error('Error sending promo email:', error);
            // Even on network error, show discount code
            // The email is nice-to-have but discount code is the main feature
            showDiscountCode('CREED5');
        }
    };

    // Reopen button handler
    const reopenBtn = document.getElementById('discount-reopen-btn');
    if (reopenBtn) {
        reopenBtn.addEventListener('click', () => {
            if (promoPopup) {
                // Reset popup to original form if it was showing discount code
                resetPopupForm();
                promoPopup.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
    }

    // Close button handlers
    if (promoCloseBtn) {
        promoCloseBtn.addEventListener('click', closePopup);
    }

    if (promoDismissBtn) {
        promoDismissBtn.addEventListener('click', closePopup);
    }

    if (promoOverlay) {
        promoOverlay.addEventListener('click', closePopup);
    }

    // Form submission handler
    if (promoForm) {
        promoForm.addEventListener('submit', handleFormSubmit);
    }

    // One automatic open per tab session (timer or exit-intent), not on every in-site navigation.
    const AUTO_DONE_KEY = 'creed_promo_autoshown_session';
    const SHOW_AT_KEY = 'creed_promo_show_at_ms';

    const tryOpenPromoAuto = () => {
        if (!promoPopup || sessionStorage.getItem(AUTO_DONE_KEY)) return;
        sessionStorage.setItem(AUTO_DONE_KEY, '1');
        sessionStorage.removeItem(SHOW_AT_KEY);
        promoPopup.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    if (promoPopup && !sessionStorage.getItem(AUTO_DONE_KEY)) {
        const now = Date.now();
        let showAt = parseInt(sessionStorage.getItem(SHOW_AT_KEY), 10);
        if (!showAt || Number.isNaN(showAt)) {
            showAt = now + 3000;
            sessionStorage.setItem(SHOW_AT_KEY, String(showAt));
        }
        const delay = Math.max(0, showAt - now);
        setTimeout(() => tryOpenPromoAuto(), delay);
    }

    /* Exit intent (desktop): cursor leaves toward the top of the window (tab close / leave).
       No reliable equivalent on touch-first devices; skipped when (hover: none). */
    if (promoPopup && window.matchMedia('(hover: hover)').matches) {
        document.documentElement.addEventListener(
            'mouseleave',
            (e) => {
                if (!e.isTrusted || e.clientY > 0) return;
                if (promoPopup.classList.contains('active')) return;
                tryOpenPromoAuto();
            },
            { passive: true }
        );
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && promoPopup?.classList.contains('active')) {
            closePopup();
        }
    });
});
