export const TIERS = {
  normal: { id: 'normal', label: 'Normal', percent: 5, code: 'ACE5' },
  interested: { id: 'interested', label: 'Interested', percent: 10, code: 'ACE10' },
  potential: { id: 'potential', label: 'Potential', percent: 15, code: 'ACE15' },
};

export function scoreAbandonedLead({ unpaidCount = 1, orderCount = 1, sessionCount = 1, spanMinutes = 0 } = {}) {
  if (unpaidCount >= 3 || orderCount >= 4 || sessionCount >= 3 || spanMinutes >= 20) {
    return TIERS.potential;
  }
  if (unpaidCount >= 2 || sessionCount >= 2 || spanMinutes >= 5) {
    return TIERS.interested;
  }
  return TIERS.normal;
}

export function productPathFor(items = []) {
  const text = items.map((i) => `${i?.name || ''} ${i?.id || ''}`).join(' ').toLowerCase();
  if (text.includes('rust')) return '/product/rust';
  if (text.includes('valorant')) return '/product/valorant';
  if (text.includes('apex')) return '/product/apex-legends';
  if (text.includes('arc')) return '/product/arc-raiders';
  if (text.includes('rainbow') || text.includes('siege') || text.includes('r6')) return '/product/rainbowsiege';
  if (text.includes('perm') && text.includes('spoof')) return '/product/perm-spoofer';
  if (text.includes('spoof')) return '/product/temp-spoofer';
  if (text.includes('cod') || text.includes('warzone') || text.includes('black ops')) return '/product/cod-black-ops-7';
  if (text.includes('universal')) return '/product/universal-aim';
  if (text.includes('fortnite')) return '/product/fortnite';
  return '/products';
}
