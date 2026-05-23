// --- 0. FAILSAVE & DATA UNPACKING ---
if (!sessionStorage.getItem('username') || !sessionStorage.getItem('roomCode')) {
    window.location.href = '/';
}

const myUsername = sessionStorage.getItem('username');
const myRoomCode = sessionStorage.getItem('roomCode');
const socket = io(); 

// Tell the server to put our new connection back into the correct room!
socket.emit('joinGameRoom', {
    roomCode: myRoomCode,
    username: myUsername
});

// --- 1. TWINKLING STARS BACKGROUND ---
const bgCanvas = document.getElementById('starsCanvas'); const bgCtx = bgCanvas.getContext('2d');
bgCanvas.width = window.innerWidth; bgCanvas.height = window.innerHeight;
const stars = [];
for (let i = 0; i < 150; i++) stars.push({ x: Math.random() * bgCanvas.width, y: Math.random() * bgCanvas.height, radius: Math.random() * 1.5 + 0.5, alpha: Math.random(), fadeSpeed: Math.random() * 0.03 + 0.01 });
function animateStars() {
    bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    for (let star of stars) {
        bgCtx.beginPath(); bgCtx.arc(star.x, star.y, star.radius, 0, Math.PI * 2); bgCtx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`; bgCtx.fill();
        star.alpha += star.fadeSpeed; if (star.alpha >= 1 || star.alpha <= 0) star.fadeSpeed *= -1;
    } requestAnimationFrame(animateStars);
} animateStars();

// --- 2. CANVAS SETUP & MEMORY ---
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

let isDrawing = false;
let amIDrawing = false; // SECURITY: Prevents guessers from drawing!
let currentColor = '#000000'; let currentSize = 8;          
let currentTool = 'pen'; let currentBrushStyle = 'pen';
let lastPos = null; 

let undoStack = []; let redoStack = [];

ctx.lineCap = 'round'; ctx.lineJoin = 'round';
ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
saveState();

function saveState() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > 20) undoStack.shift(); 
    redoStack = []; 
}

function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function broadcastCanvasSync() {
    socket.emit('syncCanvas', { roomCode: myRoomCode, image: canvas.toDataURL() });
}

// --- 3. THE MULTIPLAYER DRAWING LOGIC ---
function startDrawing(e) {
    if (!amIDrawing) return; // Block guessers!
    const pos = getMousePos(e);
    
    if (currentTool === 'fill') {
        floodFill(Math.floor(pos.x), Math.floor(pos.y), currentColor);
        saveState();
        socket.emit('fill', { roomCode: myRoomCode, x: Math.floor(pos.x), y: Math.floor(pos.y), color: currentColor });
        return;
    }

    isDrawing = true; lastPos = pos; draw(e); 
}

function stopDrawing() {
    if (isDrawing && amIDrawing) {
        isDrawing = false; saveState(); 
    }
}

function draw(e) {
    if (!isDrawing || !amIDrawing) return; // Block guessers!
    const pos = getMousePos(e);

    const drawData = {
        roomCode: myRoomCode, start: lastPos, end: pos, color: currentColor, size: currentSize, tool: currentTool, style: currentBrushStyle
    };

    executeDrawInstruction(drawData); 
    socket.emit('draw', drawData);    
    lastPos = pos;
}

function executeDrawInstruction(data) {
    ctx.globalAlpha = 1.0; ctx.shadowBlur = 0; ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(data.start.x, data.start.y);

    if (data.tool === 'eraser') {
        ctx.lineWidth = data.size; ctx.strokeStyle = '#ffffff';
        ctx.lineTo(data.end.x, data.end.y); ctx.stroke(); return; 
    }

    ctx.lineWidth = data.size; ctx.strokeStyle = data.color; ctx.fillStyle = data.color;

    if (data.style === 'pen') { ctx.lineTo(data.end.x, data.end.y); ctx.stroke(); } 
    else if (data.style === 'marker') { ctx.lineCap = 'square'; ctx.lineTo(data.end.x, data.end.y); ctx.stroke(); } 
    else if (data.style === 'brush') { ctx.shadowBlur = data.size; ctx.shadowColor = data.color; ctx.lineTo(data.end.x, data.end.y); ctx.stroke(); } 
    else if (data.style === 'highlighter') { ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'multiply'; ctx.lineTo(data.end.x, data.end.y); ctx.stroke(); } 
    else if (data.style === 'spray') {
        const density = data.size * 4; const radius = data.size;
        for (let i = 0; i < density; i++) {
            const offsetX = (Math.random() * radius * 2) - radius; const offsetY = (Math.random() * radius * 2) - radius;
            if (offsetX * offsetX + offsetY * offsetY <= radius * radius) ctx.fillRect(data.end.x + offsetX, data.end.y + offsetY, 1, 1);
        }
    }
}

canvas.addEventListener('mousedown', startDrawing); canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing); canvas.addEventListener('mouseout', stopDrawing);

// Server Network drawing events
socket.on('onDraw', (data) => executeDrawInstruction(data));
socket.on('onFill', (data) => floodFill(data.x, data.y, data.color));
socket.on('onClear', () => { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); });
socket.on('onSyncCanvas', (dataURL) => {
    const img = new Image();
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
    img.src = dataURL;
});

// The Paint Bucket
function hexToRgba(hex) { const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16); return [r, g, b, 255]; }
function floodFill(startX, startY, fillColorHex) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); const data = imgData.data; const w = canvas.width; const h = canvas.height;
    const startPos = (startY * w + startX) * 4; const startR = data[startPos]; const startG = data[startPos + 1]; const startB = data[startPos + 2]; const startA = data[startPos + 3];
    const fillRgba = hexToRgba(fillColorHex);
    if (startR === fillRgba[0] && startG === fillRgba[1] && startB === fillRgba[2]) return;
    const matchStartColor = (pos) => data[pos] === startR && data[pos + 1] === startG && data[pos + 2] === startB && data[pos + 3] === startA;
    const colorPixel = (pos) => { data[pos] = fillRgba[0]; data[pos + 1] = fillRgba[1]; data[pos + 2] = fillRgba[2]; data[pos + 3] = fillRgba[3]; };
    const pixelStack = [[startX, startY]];
    while (pixelStack.length) {
        let [x, y] = pixelStack.pop(); let pixelPos = (y * w + x) * 4;
        while (y >= 0 && matchStartColor(pixelPos)) { y--; pixelPos -= w * 4; }
        y++; pixelPos += w * 4;
        let reachLeft = false; let reachRight = false;
        while (y < h && matchStartColor(pixelPos)) {
            colorPixel(pixelPos);
            if (x > 0) { if (matchStartColor(pixelPos - 4)) { if (!reachLeft) { pixelStack.push([x - 1, y]); reachLeft = true; } } else { reachLeft = false; } }
            if (x < w - 1) { if (matchStartColor(pixelPos + 4)) { if (!reachRight) { pixelStack.push([x + 1, y]); reachRight = true; } } else { reachRight = false; } }
            y++; pixelPos += w * 4;
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

// UI Setup (Colors & Tools)
const colors = ['#000000', '#4C4C4C', '#C1C1C1', '#FFFFFF', '#EF130B', '#FF7100', '#FFE400', '#00CC00', '#00B2FF', '#231FD3', '#A300BA', '#D37CAA', '#A0522D', '#D2B48C', '#FFB6C1'];
const paletteContainer = document.getElementById('colorPalette'); const customColorPicker = document.getElementById('customColorPicker');
function updateActiveButton(nList, aNode) { nList.forEach(n => n.classList.remove('active')); aNode.classList.add('active'); }

colors.forEach((color, i) => {
    const btn = document.createElement('button'); btn.className = `color-btn ${i === 0 ? 'active' : ''}`; btn.style.backgroundColor = color;
    btn.addEventListener('click', () => { if (currentTool === 'eraser') switchTool('pen', document.getElementById('toolPen')); currentColor = color; updateActiveButton(document.querySelectorAll('.color-btn'), btn); });
    paletteContainer.insertBefore(btn, customColorPicker);
});
customColorPicker.addEventListener('input', (e) => { if (currentTool === 'eraser') switchTool('pen', document.getElementById('toolPen')); currentColor = e.target.value; document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active')); });
document.querySelectorAll('.size-btn').forEach(btn => { btn.addEventListener('click', (e) => { currentSize = parseInt(e.target.dataset.size); updateActiveButton(document.querySelectorAll('.size-btn'), e.target); }); });
function switchTool(toolName, btnElement) { currentTool = toolName; updateActiveButton(document.querySelectorAll('.tool-btn'), btnElement); }
document.getElementById('toolPen').addEventListener('click', (e) => switchTool('pen', e.currentTarget));
document.getElementById('toolFill').addEventListener('click', (e) => switchTool('fill', e.currentTarget));
document.getElementById('toolEraser').addEventListener('click', (e) => switchTool('eraser', e.currentTarget));
document.getElementById('brushStyle').addEventListener('change', (e) => currentBrushStyle = e.target.value);
document.getElementById('btnClear').addEventListener('click', () => { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); saveState(); socket.emit('clear', myRoomCode); });
document.getElementById('btnUndo').addEventListener('click', () => { if (undoStack.length > 1) { redoStack.push(undoStack.pop()); ctx.putImageData(undoStack[undoStack.length - 1], 0, 0); broadcastCanvasSync(); } });
document.getElementById('btnRedo').addEventListener('click', () => { if (redoStack.length > 0) { const state = redoStack.pop(); undoStack.push(state); ctx.putImageData(state, 0, 0); broadcastCanvasSync(); } });


// ==========================================
// NEW: THE GAME ENGINE UI LOGIC
// ==========================================

// --- THE TAUNT GENERATOR (Placed ABOVE so it doesn't crash!) ---
const taunts = [
    "Is that a potato?", 
    "Squinting might help...", 
    "My grandma draws better than this.", 
    "What is that?!", 
    "Abstract art at its finest.", 
    "I think they are using the spray tool wrong.", 
    "Ah yes... a blob.", 
    "Staring intensely...", 
    "Brain processing at 99%...", 
    "I have absolutely no idea.",
    "They are definitely trying their best.",
    "Picasso is shaking right now."
];

let tauntInterval;

function startTauntGenerator() {
    const tauntText = document.getElementById('funnyTaunt');
    if (tauntInterval) clearInterval(tauntInterval);
    
    tauntInterval = setInterval(() => {
        tauntText.style.opacity = 0; // Fade out
        setTimeout(() => {
            const randomTaunt = taunts[Math.floor(Math.random() * taunts.length)];
            tauntText.innerText = `"${randomTaunt}"`;
            tauntText.style.opacity = 1; // Fade back in
        }, 500); 
    }, 6000); 
}

// 1. UPDATE PLAYERS LIST
socket.on('updatePlayers', (players) => {
    const playerGrid = document.getElementById('gamePlayerGrid');
    playerGrid.innerHTML = ''; 
    players.sort((a, b) => b.score - a.score);

    players.forEach(player => {
        const avatarUrl = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${player.username}&backgroundColor=${player.avatar.color}&eyes=${player.avatar.eyes}&mouth=${player.avatar.mouth}&backgroundType=gradientLinear&backgroundRotation=10,20,30,280`;
        const card = document.createElement('div');
        card.className = 'game-player-card';
        card.id = `player-card-${player.id}`;
        
        card.innerHTML = `
            <img src="${avatarUrl}" alt="${player.username}">
            <div class="player-info">
                <div class="name">${player.username} <span class="drawing-icon">✏️</span></div>
                <div class="score">Pts: ${player.score}</div>
            </div>
        `;
        playerGrid.appendChild(card);
    });
});

// 2. TURN STARTING (The "Choosing a Word" Phase)
socket.on('turnStarting', (data) => {
    amIDrawing = (data.drawerId === socket.id);
    
    document.getElementById('currentRound').innerText = data.round;
    document.getElementById('totalRounds').innerText = data.totalRounds;
    
    // Show the master overlay
    document.getElementById('canvasOverlay').classList.remove('hidden');
    document.getElementById('normalWordSelection').classList.add('hidden');
    document.getElementById('customWordSelection').classList.add('hidden');
    document.getElementById('waitingForDrawer').classList.add('hidden');

    document.querySelectorAll('.game-player-card').forEach(c => c.classList.remove('is-drawing'));
    const drawerCard = document.getElementById(`player-card-${data.drawerId}`);
    if (drawerCard) drawerCard.classList.add('is-drawing');

    if (amIDrawing) {
        // I AM THE DRAWER
        document.getElementById('drawingTools').classList.remove('hidden-tools');
        document.getElementById('guesserTools').classList.add('hidden-tools');
        
        if (tauntInterval) clearInterval(tauntInterval); // Safely stop taunts!

        if (data.wordMode === 'normal') {
            document.getElementById('normalWordSelection').classList.remove('hidden');
            const wordContainer = document.getElementById('wordOptions');
            wordContainer.innerHTML = '';
            
            data.wordChoices.forEach(word => {
                const btn = document.createElement('button');
                btn.className = 'word-btn'; btn.innerText = word;
                btn.onclick = () => socket.emit('wordSelected', { roomCode: myRoomCode, word: word });
                wordContainer.appendChild(btn);
            });
        } else {
            // Custom Mode
            document.getElementById('customWordSelection').classList.remove('hidden');
            document.getElementById('customWordInput').value = '';
        }
    } else {
        // I AM A GUESSER
        document.getElementById('drawingTools').classList.add('hidden-tools');
        document.getElementById('guesserTools').classList.remove('hidden-tools');
        
        document.getElementById('waitingForDrawer').classList.remove('hidden');
        document.getElementById('overlayText').innerText = `${data.drawerName} is choosing a word...`;
        
        startTauntGenerator(); // Start the funny messages!
    }
});

// Custom Mode Submit Button
document.getElementById('submitCustomWordBtn').addEventListener('click', () => {
    const customWord = document.getElementById('customWordInput').value.trim();
    if (customWord !== '') {
        socket.emit('wordSelected', { roomCode: myRoomCode, word: customWord });
    }
});

// 3. START DRAWING
socket.on('startDrawingPhase', (data) => {
    document.getElementById('canvasOverlay').classList.add('hidden');
    document.getElementById('wordDisplay').innerText = data.blanks;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); saveState();
});

// 4. SHOW REAL WORD TO DRAWER
socket.on('youAreDrawing', (word) => {
    document.getElementById('wordDisplay').innerText = word;
});

// 5. TIMER UPDATE
socket.on('timeUpdate', (timeLeft) => {
    const timeText = document.getElementById('timeRemaining');
    const timerContainer = document.getElementById('timerContainer');
    
    timeText.innerText = timeLeft;
    
    if (timeLeft <= 10 && timeLeft > 0) {
        timerContainer.classList.add('urgent');
    } else {
        timerContainer.classList.remove('urgent');
    }
});

// 6. GAME CHAT LOGIC
const chatInput = document.getElementById('gameChatInput');
const sendChatBtn = document.getElementById('gameSendChatBtn');
const chatMessages = document.getElementById('gameChatMessages');

function sendGameMessage() {
    const text = chatInput.value.trim();
    if (text !== '') {
        socket.emit('sendChat', { roomCode: myRoomCode, username: myUsername, text: text });
        chatInput.value = '';
    }
}
sendChatBtn.addEventListener('click', sendGameMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendGameMessage(); });

socket.on('chatMessage', (data) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${data.type === 'system' ? 'system' : ''}`;
    
    if (data.type === 'correct') {
        msgDiv.classList.add('correct');
        msgDiv.innerText = data.text;
    } else if (data.type === 'close') {
        msgDiv.classList.add('close');
        msgDiv.innerText = data.text;
    } else if (data.type === 'system') {
        msgDiv.innerText = data.text;
    } else {
        msgDiv.innerHTML = `<span class="author">${data.username}:</span> ${data.text}`;
    }
    
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight; 
});

// ==========================================
// GAME OVER LOGIC
// ==========================================
socket.on('gameOver', (players) => {
    players.sort((a, b) => b.score - a.score);
    const winner = players[0];

    document.getElementById('canvasOverlay').classList.remove('hidden');
    document.getElementById('normalWordSelection').classList.add('hidden');
    document.getElementById('customWordSelection').classList.add('hidden');
    document.getElementById('waitingForDrawer').classList.add('hidden');
    
    document.getElementById('gameOverScreen').classList.remove('hidden');
    
    const winnerText = document.getElementById('winnerName');
    if (winner && winner.score > 0) {
        winnerText.innerText = `🏆 ${winner.username} Wins!\n${winner.score} pts`;
    } else {
        winnerText.innerText = `It's a tie! (0 pts)`;
    }

    if (tauntInterval) clearInterval(tauntInterval); // Stop taunts on game over!

    setTimeout(() => {
        window.location.href = '/lobby.html';
    }, 5000);
});