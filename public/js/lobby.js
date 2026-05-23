// --- 0. FAILSAVE & DATA UNPACKING ---
// If someone tries to go to localhost:3000/lobby.html directly without creating a name, kick them back!
if (!sessionStorage.getItem('username') || !sessionStorage.getItem('roomCode')) {
    window.location.href = '/';
}

// Unpack the data we saved from the Home Screen
const myUsername = sessionStorage.getItem('username');
const myRoomCode = sessionStorage.getItem('roomCode');
const myAvatar = {
    color: sessionStorage.getItem('avatarColor'),
    eyes: sessionStorage.getItem('avatarEyes'),
    mouth: sessionStorage.getItem('avatarMouth')
};

// --- 1. TWINKLING STARS BACKGROUND ---
const canvas = document.getElementById('starsCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const stars = [];
for (let i = 0; i < 150; i++) {
    stars.push({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        radius: Math.random() * 1.5 + 0.5, alpha: Math.random(), fadeSpeed: Math.random() * 0.03 + 0.01
    });
}
function animateStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let star of stars) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.fill();
        star.alpha += star.fadeSpeed;
        if (star.alpha >= 1 || star.alpha <= 0) star.fadeSpeed *= -1;
    }
    requestAnimationFrame(animateStars);
}
animateStars();
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });

// --- 2. SOCKET & LOBBY SETUP ---
const socket = io();

// Set the Room Code on the screen
document.getElementById('displayRoomCode').innerText = myRoomCode;

// Tell the server we arrived!
socket.emit('joinLobby', {
    roomCode: myRoomCode,
    username: myUsername,
    avatar: myAvatar
});

// --- 3. UI ELEMENTS ---
const playerGrid = document.getElementById('playerGrid');
const playerCountText = document.getElementById('playerCount');
const startBtn = document.getElementById('startBtn');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

// Settings Elements
const settingsModal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingPlayers = document.getElementById('settingPlayers');
const settingRounds = document.getElementById('settingRounds');
const settingTime = document.getElementById('settingTime');
const settingWordMode = document.getElementById('settingWordMode');

let amIHost = false; // We use this to lock/unlock settings

// --- 4. TOAST NOTIFICATIONS ---
function showToast(message, type = 'normal') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    
    toastContainer.appendChild(toast);
    
    // Remove the toast after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease-in reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- 5. SERVER EVENTS ---

// When the player list updates (Someone joins, leaves, or host changes)
socket.on('updatePlayers', (players) => {
    playerGrid.innerHTML = ''; // Clear the current grid
    playerCountText.innerText = players.length; // Update the counter

    players.forEach(player => {
        // Rebuild their robot image URL
        const avatarUrl = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${player.username}&backgroundColor=${player.avatar.color}&eyes=${player.avatar.eyes}&mouth=${player.avatar.mouth}&backgroundType=gradientLinear&backgroundRotation=10,20,30,280`;

        // Create the card
        const card = document.createElement('div');
        card.className = `player-card ${player.isHost ? 'is-host' : ''}`;
        
        card.innerHTML = `
            <div class="host-crown">👑</div>
            <img src="${avatarUrl}" alt="${player.username}">
            <div class="player-name">${player.username}</div>
        `;
        playerGrid.appendChild(card);

        // Check if *I* am the host!
        if (player.id === socket.id) {
            amIHost = player.isHost;
            
            // Lock or unlock controls
            startBtn.disabled = !amIHost;
            settingPlayers.disabled = !amIHost;
            settingRounds.disabled = !amIHost;
            settingTime.disabled = !amIHost;
            settingWordMode.disabled = !amIHost;
        }
    });
});

// When settings are changed by the host
socket.on('settingsUpdated', (settings) => {
    settingPlayers.value = settings.players;
    settingRounds.value = settings.rounds;
    settingTime.value = settings.time;
    settingWordMode.value = settings.wordMode;
    showToast('⚙️ Room settings updated!');
});

// When someone sends a chat message
socket.on('chatMessage', (data) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${data.type === 'system' ? 'system' : ''}`;
    
    if (data.type === 'system') {
        msgDiv.innerText = data.text;
    } else {
        msgDiv.innerHTML = `<span class="author">${data.username}:</span> ${data.text}`;
    }
    
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to bottom
});

// When the host clicks start
socket.on('gameStarted', () => {
    window.location.href = '/game.html';
});


// --- 6. USER INTERACTIONS (BUTTON CLICKS) ---

// Chat Sending
function sendMessage() {
    const text = chatInput.value.trim();
    if (text !== '') {
        socket.emit('sendChat', { roomCode: myRoomCode, username: myUsername, text: text });
        chatInput.value = '';
    }
}
sendChatBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Copy Room Code Button
document.getElementById('copyCodeBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(myRoomCode);
    showToast('📋 Room code copied to clipboard!');
});

// Settings Modal Toggles
settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

// When the Host changes a setting
function emitSettingsChange() {
    if (!amIHost) return; // Only host can change settings!
    
    const newSettings = {
        players: parseInt(settingPlayers.value),
        rounds: parseInt(settingRounds.value),
        time: parseInt(settingTime.value),
        wordMode: settingWordMode.value
    };
    socket.emit('updateSettings', { roomCode: myRoomCode, settings: newSettings });
}

// Attach the event to all settings inputs
settingPlayers.addEventListener('change', emitSettingsChange);
settingRounds.addEventListener('change', emitSettingsChange);
settingTime.addEventListener('change', emitSettingsChange);
settingWordMode.addEventListener('change', emitSettingsChange);

// Start Game Button
startBtn.addEventListener('click', () => {
    if (amIHost) {
        socket.emit('startGame', myRoomCode);
    } else {
        showToast('Only the host can start the game!', 'error');
    }
});