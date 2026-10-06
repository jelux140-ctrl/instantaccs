(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let walletClient;

  async function getClient() {
    if (walletClient) return walletClient;
    const response = await fetch('/api/supabase-public');
    const config = await response.json();
    if (!response.ok) throw new Error(config.error || 'Account service unavailable');
    walletClient = window.supabase.createClient(config.url, config.anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    return walletClient;
  }

  async function refreshBalance() {
    const client = await getClient();
    const { data: auth } = await client.auth.getSession();
    const user = auth.session?.user;
    if (!user) return;
    const { data } = await client.from('customer_wallets').select('balance_cents').eq('user_id', user.id).maybeSingle();
    $('wallet-balance').textContent = ((data?.balance_cents || 0) / 100).toFixed(2);
  }

  function amount() {
    return Math.min(1000, Math.max(5, Math.round(Number($('funds-amount').value || 5))));
  }
  function updateAmount(next) {
    $('funds-amount').value = Math.min(1000, Math.max(5, next));
    $('summary-total').textContent = `$${amount().toFixed(2)}`;
    $('funds-amount').classList.remove('number-pop');
    requestAnimationFrame(() => $('funds-amount').classList.add('number-pop'));
    setTimeout(() => $('funds-amount').classList.remove('number-pop'), 150);
    $('funds-error').classList.remove('show');
  }
  function closeModal() {
    const overlay = $('funds-modal');
    overlay.classList.remove('is-open');
    overlay.classList.add('is-closing');
    setTimeout(() => { overlay.classList.add('hidden'); overlay.classList.remove('is-closing'); document.body.style.overflow = ''; }, 180);
  }
  function openModal() {
    const overlay = $('funds-modal');
    updateAmount(amount());
    overlay.classList.remove('hidden', 'is-closing');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-open')));
    setTimeout(() => $('funds-close').focus(), 260);
  }

  $('add-credits-button').addEventListener('click', openModal);
  $('funds-close').addEventListener('click', closeModal);
  $('funds-modal').addEventListener('click', (event) => { if (event.target === $('funds-modal')) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('funds-modal').classList.contains('hidden')) closeModal(); });
  $('amount-minus').addEventListener('click', () => updateAmount(amount() - 5));
  $('amount-plus').addEventListener('click', () => updateAmount(amount() + 5));
  $('funds-amount').addEventListener('input', () => updateAmount(amount()));
  document.querySelectorAll('.payment-option').forEach((option) => option.addEventListener('click', () => {
    if (option.classList.contains('unavailable')) {
      $('funds-error').textContent = `${option.querySelector('strong').textContent} is not connected yet. Card payments are available now.`;
      $('funds-error').classList.add('show');
      option.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 220, easing: 'ease-out' });
    } else {
      document.querySelectorAll('.payment-option').forEach((item) => { item.classList.toggle('active', item === option); item.setAttribute('aria-pressed', String(item === option)); });
      $('funds-error').classList.remove('show');
    }
  }));

  $('pay-now').addEventListener('click', async () => {
    const button = $('pay-now');
    const error = $('funds-error');
    error.classList.remove('show');
    button.disabled = true;
    button.classList.add('is-loading');
    button.querySelector('span').textContent = 'Opening secure checkout…';
    try {
      const client = await getClient();
      const { data: auth } = await client.auth.getSession();
      if (!auth.session) throw new Error('Your session expired. Sign in again.');
      const response = await fetch('https://pay.creedv2.com/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.session.access_token}` },
        body: JSON.stringify({ checkoutType: 'wallet_topup', amount: amount(), paymentMethod: 'card' })
      });
      const result = await response.json();
      if (!response.ok || !result.paymentUrl) throw new Error(result.error || 'Could not open payment checkout');
      location.assign(result.paymentUrl);
    } catch (failure) {
      error.textContent = failure.message || 'Something went wrong. Please try again.';
      error.classList.add('show');
      button.disabled = false;
      button.classList.remove('is-loading');
      button.querySelector('span').textContent = 'Pay securely';
    }
  });

  const params = new URLSearchParams(location.search);
  if (params.get('topup') === 'success') {
    let attempts = 0;
    const poll = setInterval(async () => { await refreshBalance(); if (++attempts >= 6) clearInterval(poll); }, 1500);
  }
  window.addEventListener('load', () => setTimeout(refreshBalance, 500));
})();
