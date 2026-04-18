let socket = null;
const urlParams = new URLSearchParams(window.location.search);
let chatPassword = urlParams.get('pw');

// Config: This will be replaced by GitHub Actions during deployment
const WORKER_URL = '{{WORKER_URL}}';

const messagesDiv = document.getElementById('obs-messages');

function init() {
    if (urlParams.get('debug') === 'true' || urlParams.get('test') === 'true') {
        const debugPanel = document.getElementById('debug-panel');
        if (debugPanel) debugPanel.style.display = 'block';

        const testBtn = document.getElementById('test-relay-btn');
        const statusDiv = document.getElementById('debug-status');

        if (testBtn) {
            testBtn.onclick = () => {
                statusDiv.innerText = 'Sending...';
                relayToTwitch('DebugUser', 'Manual test from OBS button');
                setTimeout(() => {
                    statusDiv.innerText = 'Sent (Check Twitch/Firebot)';
                }, 1000);
            };
        }
    }

    if (urlParams.get('test') === 'true') {
        appendMessage({ username: 'System', message: 'This is a test message' });
        appendMessage({ username: 'User1', message: 'Hello from OBS!' });
        return;
    }
    if (!chatPassword) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'obs-message';
        errorMsg.innerText = 'Error: Missing ?pw=... in URL';
        messagesDiv.appendChild(errorMsg);
        return;
    }
    connectWebSocket();
}

async function connectWebSocket() {
    // 1. Get a temporary token using the password
    let token = '';
    try {
        const httpUrl = WORKER_URL.replace('wss://', 'https://').replace('ws://', 'http://').replace('/ws', '');
        const response = await fetch(`${httpUrl}/login`, {
            method: 'POST',
            body: JSON.stringify({ password: chatPassword }),
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        token = data.token;
    } catch (err) {
        console.error('Login failed:', err);
        const errorMsg = document.createElement('div');
        errorMsg.className = 'obs-message';
        errorMsg.innerText = 'Login Failed: Check Password';
        messagesDiv.appendChild(errorMsg);
        return;
    }

    // 2. Connect with token
    const url = `${WORKER_URL}?token=${token}`;
    socket = new WebSocket(url);

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'history') {
            messagesDiv.innerHTML = '';
            // Only show last 10 messages for OBS feed to keep it clean
            const lastTen = data.messages.slice(-10);
            lastTen.forEach(msg => appendMessage(msg));
        } else if (data.type === 'chat') {
            // Optional: Hide messages from overlay if relayonly is true
            if (urlParams.get('relayonly') !== 'true') {
                appendMessage(data);
            }

            // Relay to Firebot for Twitch
            relayToTwitch(data.username, data.message);

            // Limit messages on screen
            if (messagesDiv.children.length > 15) {
                messagesDiv.removeChild(messagesDiv.firstChild);
            }
        }
    };

    socket.onclose = () => {
        setTimeout(connectWebSocket, 3000);
    };
}

function appendMessage(data) {
    const msgElement = document.createElement('div');
    msgElement.className = 'obs-message';

    // Auto-hide message after 100 seconds
    setTimeout(() => {
        msgElement.style.transition = 'opacity 1s';
        msgElement.style.opacity = '0';
        setTimeout(() => {
            if (msgElement.parentNode) {
                msgElement.parentNode.removeChild(msgElement);
            }
        }, 1000);
    }, 100000);

    const usernameSpan = document.createElement('span');
    usernameSpan.className = 'obs-username';
    usernameSpan.innerText = `${data.username}: `;
    usernameSpan.style.color = getUsernameColor(data.username);

    const textSpan = document.createElement('span');
    textSpan.className = 'obs-text';
    textSpan.innerText = data.message;

    msgElement.appendChild(usernameSpan);
    msgElement.appendChild(textSpan);
    messagesDiv.appendChild(msgElement);

    // Auto scroll to bottom
    window.scrollTo(0, document.body.scrollHeight);
}

function relayToTwitch(username, message) {
    // Format: " username : message "
    const relayMessage = ` ${username} : ${message} `;

    // Configurable Preset ID (default to the one created by user)
    const presetId = urlParams.get('firebotPresetId') || '8bd07347-2a73-4694-b37e-5ed7caf4b872';

    // Post to Firebot's local API (127.0.0.1:7472)
    // We use a Preset Effect List because it's the most reliable way to pass dynamic data to Firebot.
    fetch(`http://127.0.0.1:7472/api/v1/effects/preset/${presetId}/run`, {
        method: 'POST',
        // Use text/plain to avoid CORS preflight which can be blocked by Private Network Access rules
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            username: 'System',
            args: {
                arg1: relayMessage
            }
        }),
        // Experimental flag to help with Chrome's Private Network Access security
        targetAddressSpace: 'local'
    })
    .then(res => {
        if (!res.ok) console.warn('[Firebot Relay] Response not OK:', res.status);
    })
    .catch(err => {
        console.error('[Firebot Relay] Failed. Is Firebot running and API enabled?', err);
    });
}

function getUsernameColor(username) {
    const colors = ['#bb86fc', '#03dac6', '#ffb74d', '#4db6ac', '#81c784', '#ff8a65', '#64b5f6', '#f06292'];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

init();
