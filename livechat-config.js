/* Live chat config for Creed — same widget as DirectCheats, Creed gold. */
(function () {
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1';

  window.CREED_CHAT = {
    server: isLocal ? 'http://localhost:3000' : 'https://livechat-production-4030.up.railway.app',
    company: 'Creed',
    subtitle: 'Customer support',
    color: '#FFB800',
    theme: 'dark',
    icon: '/assets/support.jpg',
    welcome: 'Hey — this is Creed support. Keys, setup, status, or which cheat to buy?',
    teaser: '👋 Need help with Creed?',
    quickReplies: 'Where\'s my key?,Which cheat do I need?,Talk to a human',
    faqUrl: '/chat-faq.json',
    sound: 'on'
  };
})();
