/* =========================================
   CREED - AI CHATBOT COMPONENT
   Floating chatbot with Gemini AI integration
   ========================================= */

const CHAT_AUTO_OPEN_KEY = 'creed_ai_widget_auto_opened';
const CHAT_AUTO_DELAY_MS = 15000;

/** Short “pop” notification (Web Audio; no asset file). */
function playChatbotPopSound() {
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.12, now);
        master.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        master.connect(ctx.destination);

        const beep = (freq, t0, dur) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(freq, t0);
            g.gain.setValueAtTime(0.2, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            o.connect(g);
            g.connect(master);
            o.start(t0);
            o.stop(t0 + dur);
        };

        beep(880, now, 0.04);
        beep(1174, now + 0.05, 0.05);

        setTimeout(() => ctx.close(), 400);
    } catch (_) {
        /* autoplay or API blocked */
    }
}

function ensureChatbotMarkup() {
    if (document.getElementById('chatbot-button') && document.getElementById('chatbot-widget')) {
        return;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = `
    <button id="chatbot-button" type="button" title="Chat with Creed AI Assistant">
        <img src="/assets/creedlogo.png" alt="Creed AI">
    </button>
    <div id="chatbot-widget">
        <div id="chatbot-header">
            <div class="chatbot-header-content">
                <div class="chatbot-header-logo">
                    <img src="/assets/creedlogo.png" alt="Creed">
                </div>
                <div class="chatbot-header-text">
                    <h3 class="chatbot-header-title">Creed AI Assistant</h3>
                    <p class="chatbot-header-subtitle">Ask me anything!</p>
                </div>
            </div>
            <button id="chatbot-close" type="button" title="Close Chat">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div id="chatbot-messages"></div>
        <div id="chatbot-input-container">
            <input type="text" id="chatbot-input" placeholder="Type your message..." autocomplete="off">
            <button id="chatbot-send" type="button" title="Send Message">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>
    </div>`;
    document.body.appendChild(wrap);
}

document.addEventListener('DOMContentLoaded', () => {
    ensureChatbotMarkup();

    const chatbotButton = document.getElementById('chatbot-button');
    const chatbotWidget = document.getElementById('chatbot-widget');
    const chatbotClose = document.getElementById('chatbot-close');
    const chatbotHeader = document.getElementById('chatbot-header');
    const chatbotMessages = document.getElementById('chatbot-messages');
    const chatbotInput = document.getElementById('chatbot-input');
    const chatbotSend = document.getElementById('chatbot-send');

    if (!chatbotButton || !chatbotWidget) return;

    let isOpen = false;
    let conversationHistory = [];
    let welcomeShown = false;

    let autoOpenTimer = null;
    const cancelAutoOpen = () => {
        if (autoOpenTimer !== null) {
            clearTimeout(autoOpenTimer);
            autoOpenTimer = null;
        }
    };

    const showWelcomeIfNeeded = () => {
        if (welcomeShown || !isOpen) return;
        setTimeout(() => {
            if (welcomeShown || !isOpen) return;
            addMessage(
                "Hello! I'm Creed's AI assistant. How can I help you today? You can ask me about our products, payment methods, support, or anything else!",
                false
            );
            welcomeShown = true;
        }, 280);
    };

    const openChatbot = () => {
        if (isOpen) return;
        isOpen = true;
        chatbotWidget.classList.add('active');
        chatbotButton.classList.add('active');
        chatbotInput.focus();
        showWelcomeIfNeeded();
    };

    const closeChatbot = () => {
        isOpen = false;
        chatbotWidget.classList.remove('active');
        chatbotButton.classList.remove('active');
    };

    const toggleChatbot = () => {
        if (isOpen) {
            closeChatbot();
        } else {
            openChatbot();
        }
    };

    window.openCreedLivechat = openChatbot;
    window.openCreedAI = openChatbot;

    const escapeHtml = (s) => {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    };

    /* The model still slips markdown in now and then (**bold**, * bullets),
       which used to render as literal asterisks. Escape first, then turn the
       small subset it actually uses into real HTML. */
    const renderBotText = (raw) => {
        const lines = String(raw || '').replace(/\r/g, '').split('\n');
        let html = '';
        let inList = false;

        const inline = (s) =>
            escapeHtml(s)
                .replace(/\*\*\*(.+?)\*\*\*/g, '<strong>$1</strong>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s,.!?)]|$)/g, '$1<em>$2</em>')
                .replace(/`([^`\n]+)`/g, '<code>$1</code>');

        for (let line of lines) {
            const trimmed = line.trim();
            const bullet = trimmed.match(/^(?:[*\-•]|\d+\.)\s+(.*)$/);

            if (bullet) {
                if (!inList) { html += '<ul class="chatbot-list">'; inList = true; }
                html += `<li>${inline(bullet[1])}</li>`;
                continue;
            }

            if (inList) { html += '</ul>'; inList = false; }
            if (!trimmed) { html += '<br>'; continue; }
            // Strip leftover heading hashes
            html += `<p>${inline(trimmed.replace(/^#{1,6}\s*/, ''))}</p>`;
        }
        if (inList) html += '</ul>';
        return html;
    };

    const addMessage = (content, isUser = false) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chatbot-message ${isUser ? 'user' : 'bot'}`;

        if (!isUser) {
            const avatar = document.createElement('div');
            avatar.className = 'chatbot-avatar';
            avatar.innerHTML = '<img src="/assets/creedlogo.png" alt="Creed">';
            messageDiv.appendChild(avatar);
        }

        const messageContent = document.createElement('div');
        messageContent.className = 'chatbot-message-content';
        if (isUser) {
            messageContent.textContent = content;
        } else {
            messageContent.innerHTML = renderBotText(content);
        }
        messageDiv.appendChild(messageContent);

        chatbotMessages.appendChild(messageDiv);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

        conversationHistory.push({
            role: isUser ? 'user' : 'assistant',
            content: content,
        });
    };

    const sendMessage = async () => {
        const message = chatbotInput.value.trim();
        if (!message) return;

        addMessage(message, true);
        chatbotInput.value = '';
        chatbotSend.disabled = true;
        chatbotSend.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'chatbot-message bot typing';
        typingIndicator.innerHTML = `
            <div class="chatbot-avatar">
                <img src="/assets/creedlogo.png" alt="Creed">
            </div>
            <div class="chatbot-message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        chatbotMessages.appendChild(typingIndicator);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

        try {
            const apiPath = '/api/chatbot';
            const response = await fetch(apiPath, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    conversationHistory: conversationHistory.slice(0, -1),
                }),
            });

            typingIndicator.remove();

            const contentType = response.headers.get('content-type');
            let data;

            if (contentType && contentType.includes('application/json')) {
                try {
                    data = await response.json();
                } catch (jsonError) {
                    console.error('Failed to parse JSON response:', jsonError);
                    const textResponse = await response.text();
                    console.error('Response text:', textResponse);
                    addMessage(
                        'I apologize, but I encountered an error parsing the response. Please try again or contact our Discord support at https://discord.gg/creedgg',
                        false
                    );
                    return;
                }
            } else {
                const textResponse = await response.text();
                console.error('Non-JSON response received:', response.status, textResponse.substring(0, 200));

                if (response.status === 404) {
                    addMessage(
                        'I apologize, but the chatbot API endpoint was not found. Please contact our Discord support at https://discord.gg/creedgg',
                        false
                    );
                } else {
                    addMessage(
                        `I apologize, but I encountered a server error (${response.status}). Please try again or contact our Discord support at https://discord.gg/creedgg`,
                        false
                    );
                }
                return;
            }

            if (!response.ok) {
                console.error('API response not OK:', response.status, data);
                const errorMsg = data.details || data.error || `Server error (${response.status}). Please try again or contact our Discord support.`;
                console.error('Full error details:', errorMsg);
                addMessage(
                    `I apologize, but I encountered an error: ${errorMsg}. Please try again or contact our Discord support at https://discord.gg/creedgg`,
                    false
                );
            } else if (data.success && data.response) {
                addMessage(data.response, false);
            } else if (data.response) {
                addMessage(data.response, false);
            } else {
                console.error('Unexpected response format:', data);
                addMessage(
                    data.error ||
                        data.details ||
                        'I apologize, but I encountered an error. Please try again or contact our Discord support at https://discord.gg/creedgg',
                    false
                );
            }
        } catch (error) {
            console.error('Chatbot error:', error);
            typingIndicator.remove();
            addMessage(
                `I apologize, but I encountered an error: ${error.message}. Please try again or contact our Discord support at https://discord.gg/creedgg`,
                false
            );
        } finally {
            chatbotSend.disabled = false;
            chatbotSend.innerHTML = '<i class="fas fa-paper-plane"></i>';
            chatbotInput.focus();
        }
    };

    if (chatbotButton) {
        chatbotButton.addEventListener('click', () => {
            cancelAutoOpen();
            if (!isOpen) {
                sessionStorage.setItem(CHAT_AUTO_OPEN_KEY, '1');
            }
            toggleChatbot();
        });
    }

    if (chatbotClose) {
        chatbotClose.addEventListener('click', (e) => {
            e.stopPropagation();
            closeChatbot();
        });
    }

    if (chatbotHeader) {
        chatbotHeader.addEventListener('click', (e) => {
            if (e.target.id !== 'chatbot-close' && !e.target.closest('#chatbot-close')) {
                toggleChatbot();
            }
        });
    }

    if (chatbotSend) {
        chatbotSend.addEventListener('click', sendMessage);
    }

    if (chatbotInput) {
        chatbotInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    if (chatbotButton && chatbotWidget && !sessionStorage.getItem(CHAT_AUTO_OPEN_KEY)) {
        autoOpenTimer = setTimeout(() => {
            autoOpenTimer = null;
            if (isOpen) return;
            playChatbotPopSound();
            openChatbot();
            sessionStorage.setItem(CHAT_AUTO_OPEN_KEY, '1');
        }, CHAT_AUTO_DELAY_MS);
    }
});
