let socket = null;
let currentUsername = localStorage.getItem('chat-username') || '';
let chatPassword = localStorage.getItem('chat-password') || '';

// Config: This will be replaced by GitHub Actions during deployment
const WORKER_URL = '{{WORKER_URL}}';

const loginScreen = document.getElementById('login-screen');
const usernameScreen = document.getElementById('username-screen');
const chatContainer = document.getElementById('chat-container');
const messagesDiv = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const displayUsername = document.getElementById('display-username');

function init() {
    if (!chatPassword) {
        showLogin();
    } else if (!currentUsername) {
        showUsernameSetup();
    } else {
        startChat();
    }
}

function showLogin() {
    loginScreen.classList.remove('hidden');
    document.getElementById('login-btn').onclick = () => {
        const pw = document.getElementById('password-input').value;
        if (pw) {
            chatPassword = pw;
            localStorage.setItem('chat-password', pw);
            loginScreen.classList.add('hidden');
            init();
        }
    };
}

function showUsernameSetup() {
    usernameScreen.classList.remove('hidden');
    document.getElementById('set-username-btn').onclick = () => {
        const username = document.getElementById('username-input').value;
        if (username) {
            currentUsername = username;
            localStorage.setItem('chat-username', username);
            usernameScreen.classList.add('hidden');
            init();
        }
    };
}

function startChat() {
    chatContainer.classList.remove('hidden');
    displayUsername.innerText = currentUsername;

    connectWebSocket();
}

async function connectWebSocket() {
    // 1. Get a temporary token using the password
    let token = '';
    try {
        const httpUrl = WORKER_URL.replace('wss://', 'https://').replace('ws://', 'http://').replace('/ws', '').replace(/\/$/, '');

        // Debug: check status first
        try {
            const statusCheck = await fetch(httpUrl);
            console.log('Worker status:', await statusCheck.text());
        } catch (e) {
            console.warn('Status check failed (expected if CORS is strict on /):', e);
        }

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
        alert('Connection error: ' + err.message);
        handleAuthError();
        return;
    }

    // 2. Connect with token
    const url = `${WORKER_URL}?token=${token}`;
    socket = new WebSocket(url);

    socket.onopen = () => {
        console.log('Connected to chat');
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        // If the connection fails immediately, it might be an auth error
        // since we can't see the 401 status code in JS WebSocket API
        // we'll check if it ever opened.
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'history') {
            messagesDiv.innerHTML = '';
            data.messages.forEach(msg => appendMessage(msg));
        } else if (data.type === 'chat') {
            appendMessage(data);
        } else if (data.type === 'error') {
            alert('Error: ' + data.message);
            if (data.message === 'Unauthorized') {
                localStorage.removeItem('chat-password');
                location.reload();
            }
        }
    };

    socket.onclose = (event) => {
        console.log('Disconnected. Code:', event.code);
        // 4001 is a custom code we could use, but standard 401 results in a generic close
        // If it closes immediately without ever opening, or with a specific error
        if (event.code === 1008 || event.code === 1003) { // Policy violation or unsupported data
             handleAuthError();
        } else {
             console.log('Retrying in 3 seconds...');
             setTimeout(connectWebSocket, 3000);
        }
    };
}

function handleAuthError() {
    alert('Authentication failed. Please check your password.');
    localStorage.removeItem('chat-password');
    location.reload();
}

function appendMessage(data) {
    const msgElement = document.createElement('div');
    msgElement.className = 'message';
    if (data.username === currentUsername) {
        msgElement.classList.add('own');
    }

    const usernameSpan = document.createElement('span');
    usernameSpan.className = 'username';
    usernameSpan.innerText = data.username;
    usernameSpan.style.color = getUsernameColor(data.username);

    const textDiv = document.createElement('div');
    textDiv.innerText = data.message;

    msgElement.appendChild(usernameSpan);
    msgElement.appendChild(textDiv);
    messagesDiv.appendChild(msgElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function getUsernameColor(username) {
    const colors = ['#bb86fc', '#03dac6', '#ffb74d', '#4db6ac', '#81c784', '#ff8a65'];
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

chatForm.onsubmit = (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'chat',
            username: currentUsername,
            message: message
        }));
        messageInput.value = '';
    }
};

document.getElementById('change-username-btn').onclick = () => {
    const newUsername = prompt('Enter new username:', currentUsername);
    if (newUsername) {
        currentUsername = newUsername;
        localStorage.setItem('chat-username', currentUsername);
        displayUsername.innerText = currentUsername;
    }
};

init();
