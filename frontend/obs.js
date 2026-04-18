let socket = null;
const urlParams = new URLSearchParams(window.location.search);
let chatPassword = urlParams.get('pw');

// Config: This will be replaced by GitHub Actions during deployment
const WORKER_URL = '{{WORKER_URL}}';

const messagesDiv = document.getElementById('obs-messages');

function init() {
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
            appendMessage(data);
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

function getUsernameColor(username) {
    const colors = ['#bb86fc', '#03dac6', '#ffb74d', '#4db6ac', '#81c784', '#ff8a65', '#64b5f6', '#f06292'];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

init();
