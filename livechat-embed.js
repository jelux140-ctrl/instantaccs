/* Loads the self-hosted livechat widget in Creed colors. */
(function () {
  'use strict';
  var cfg = window.CREED_CHAT || {};
  var server = (cfg.server || 'http://localhost:3000').replace(/\/$/, '');
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1';
  if (!isLocal && /localhost|127\.0\.0\.1/.test(server)) return;

  window.openCreedLivechat = function () {
    var launcher = document.querySelector('.lc-launcher');
    if (launcher) launcher.click();
  };

  var s = document.createElement('script');
  s.src = server + '/widget.js';
  s.defer = true;
  s.dataset.company = cfg.company || 'Creed';
  s.dataset.subtitle = cfg.subtitle || 'Customer support';
  s.dataset.color = cfg.color || '#FFB800';
  s.dataset.theme = cfg.theme || 'dark';
  if (cfg.icon) s.dataset.icon = cfg.icon;
  s.dataset.welcome = cfg.welcome || '';
  s.dataset.teaser = cfg.teaser || '';
  s.dataset.quickReplies = cfg.quickReplies || '';
  if (cfg.faqUrl) s.dataset.faqUrl = cfg.faqUrl;
  s.dataset.sound = cfg.sound || 'on';
  document.body.appendChild(s);

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.open-livechat');
    if (!btn) return;
    e.preventDefault();
    window.openCreedLivechat();
  });
})();
