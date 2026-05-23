const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const path = require('path');
const wordsList = require('./words.js');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(express.static(path.join(__dirname, 'public')));

const roomsData = {};

function generateRoomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) code += characters.charAt(Math.floor(Math.random() * characters.length));
    return code;
}

function getRandomWords(count) {
    const shuffled = [...wordsList].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function getBlanks(word) {
    return word.replace(/[a-zA-Z0-9]/g, '_ ').trim();
}

// Math function to check if a typo is "Close" (1 or 2 letters off)
function isClose(guess, word) {
    if (Math.abs(guess.length - word.length) > 2) return false;
    const track = Array(word.length + 1).fill(null).map(() => Array(guess.length + 1).fill(null));
    for (let i = 0; i <= word.length; i += 1) track[i][0] = i;
    for (let j = 0; j <= guess.length; j += 1) track[0][j] = j;
    for (let i = 1; i <= word.length; i += 1) {
        for (let j = 1; j <= guess.length; j += 1) {
            const indicator = word[i - 1] === guess[j - 1] ? 0 : 1;
            track[i][j] = Math.min(track[i - 1][j] + 1, track[i][j - 1] + 1, track[i - 1][j - 1] + indicator);
        }
    }
    return track[word.length][guess.length] <= 2; 
}

function startNextTurn(io, roomCode) {
    const room = roomsData[roomCode];
    if (!room) return;

    room.game.currentDrawerIndex++;
    if (room.game.currentDrawerIndex >= room.players.length) {
        room.game.currentDrawerIndex = 0;
        room.game.round++;
    }

    if (room.game.round > room.settings.rounds) {
        room.isTransitioning = true; // Lock the room!
        io.to(roomCode).emit('gameOver', room.players);
        
        // Give them 5 seconds to view the winner, PLUS 10 seconds to load the Lobby safely!
        setTimeout(() => {
            if (roomsData[roomCode]) roomsData[roomCode].isTransitioning = false;
        }, 15000); 
        return;
    }

    const drawer = room.players[room.game.currentDrawerIndex];
    room.game.drawerId = drawer.id;
    room.game.currentWord = ''; 
    room.game.correctGuessers = []; // Reset guessers for the new round!

    const isNormalMode = room.settings.wordMode === 'normal';
    const wordChoices = isNormalMode ? getRandomWords(4) : [];
    room.game.wordChoices = wordChoices; 

    io.to(roomCode).emit('turnStarting', {
        drawerId: drawer.id,
        drawerName: drawer.username,
        round: room.game.round,
        totalRounds: room.settings.rounds,
        wordMode: room.settings.wordMode,
        wordChoices: wordChoices
    });
}

io.on('connection', (socket) => {
    
    socket.on('createRoom', (playerData) => {
        const roomCode = generateRoomCode();
        roomsData[roomCode] = { 
            players: [], hostId: null, 
            settings: { players: 8, rounds: 3, time: 100, wordMode: 'normal' }, 
            game: null, isTransitioning: false 
        };
        socket.join(roomCode); socket.emit('roomCreated', roomCode);
    });

    socket.on('joinRoom', (playerData) => {
        const roomCode = playerData.roomCode.toUpperCase(); 
        if (io.sockets.adapter.rooms.has(roomCode) && roomsData[roomCode]) {
            if (roomsData[roomCode].players.length >= roomsData[roomCode].settings.players) { socket.emit('roomError', 'Room is full!'); return; }
            socket.join(roomCode); socket.emit('roomJoined', roomCode);
        } else { socket.emit('roomError', 'Room not found!'); }
    });

    socket.on('joinLobby', (data) => {
        const { roomCode, username, avatar } = data;
        const room = roomsData[roomCode];
        if (!room) return;
        socket.join(roomCode);

        // Check if player is returning from a finished game!
        const existingPlayer = room.players.find(p => p.username === username);
        
        if (existingPlayer) {
            // Update their connection ID but keep their host status!
            existingPlayer.id = socket.id;
            if (existingPlayer.isHost) room.hostId = socket.id;
        } else {
            // Brand new player
            let isHost = room.players.length === 0;
            if (isHost) room.hostId = socket.id;
            const player = { id: socket.id, username: username, avatar: avatar, isHost: isHost, score: 0 };
            room.players.push(player);
        }

        io.to(roomCode).emit('updatePlayers', room.players);
        io.to(roomCode).emit('settingsUpdated', room.settings);
        
        if (!existingPlayer) {
            io.to(roomCode).emit('chatMessage', { username: 'System', text: `👋 ${username} joined!`, type: 'system' });
        }
    });

    // ==========================================
    // THE SMART CHAT & GUESSING ENGINE
    // ==========================================
    socket.on('sendChat', (data) => {
        const room = roomsData[data.roomCode];
        if (!room) return;

        // If the game is actively running (a word is chosen)
        if (room.game && room.game.currentWord !== '') {
            const guess = data.text.trim().toUpperCase();
            const actualWord = room.game.currentWord.toUpperCase();
            
            const player = room.players.find(p => p.username === data.username);
            const isDrawer = room.game.drawerId === player.id;
            const hasAlreadyGuessed = room.game.correctGuessers.includes(player.id);

            // CHEAT CHECK: The drawer cannot type the word!
            if (isDrawer) {
                if (guess.includes(actualWord) || actualWord.includes(guess)) {
                    socket.emit('chatMessage', { username: 'System', text: 'You cannot type the word in chat!', type: 'system' });
                    return; 
                }
            } 
            // GUESS CHECK: If they haven't guessed it yet
            else if (!hasAlreadyGuessed) {
                if (guess === actualWord) {
                    // CORRECT GUESS!
                    room.game.correctGuessers.push(player.id);
                    
                    // Calculate points (Faster guess = more points)
                    const timeRatio = room.game.timeLeft / room.settings.time;
                    const points = Math.max(50, Math.floor(timeRatio * 500));
                    player.score += points;

                    // Give the Drawer points too!
                    const drawer = room.players.find(p => p.id === room.game.drawerId);
                    if (drawer) drawer.score += 100;

                    // Broadcast success and update leaderboards
                    io.to(data.roomCode).emit('chatMessage', { username: 'System', text: `${data.username} guessed the word!`, type: 'correct' });
                    io.to(data.roomCode).emit('updatePlayers', room.players);

                    // EARLY TURN END: Did EVERYONE guess it?
                    if (room.game.correctGuessers.length >= room.players.length - 1 && room.players.length > 1) {
                        clearInterval(room.game.timer);
                        io.to(data.roomCode).emit('chatMessage', { username: 'System', text: `🎉 Everyone guessed it! The word was: ${actualWord}`, type: 'system' });
                        setTimeout(() => { startNextTurn(io, data.roomCode); }, 4000);
                    }
                    return; // Stop here so we don't broadcast the actual word in the chat!
                } 
                else if (isClose(guess, actualWord)) {
                    // CLOSE GUESS! (Only tell the person who typed it)
                    socket.emit('chatMessage', { username: 'System', text: `'${data.text}' is close!`, type: 'close' });
                }
            }
        }
        
        // If it wasn't a correct guess or cheat attempt, forward the message normally
        io.to(data.roomCode).emit('chatMessage', { username: data.username, text: data.text, type: 'normal' });
    });

    socket.on('updateSettings', (data) => {
        if (roomsData[data.roomCode] && roomsData[data.roomCode].hostId === socket.id) {
            roomsData[data.roomCode].settings = data.settings;
            socket.to(data.roomCode).emit('settingsUpdated', data.settings);
        }
    });

    socket.on('startGame', (roomCode) => {
        const room = roomsData[roomCode];
        if (room && room.hostId === socket.id) {
            // Reset ALL scores to 0 before starting!
            room.players.forEach(p => p.score = 0);
            
            room.isTransitioning = true;
            room.game = { round: 1, currentDrawerIndex: -1, currentWord: '', timer: null, timeLeft: 0, playersLoaded: 0, wordChoices: [], correctGuessers: [] };
            io.to(roomCode).emit('gameStarted');
            
            room.game.fallbackTimer = setTimeout(() => {
                room.isTransitioning = false;
                if (room.game.currentDrawerIndex === -1) startNextTurn(io, roomCode);
            }, 5000);
        }
    });

    socket.on('joinGameRoom', (data) => {
        socket.join(data.roomCode);
        const room = roomsData[data.roomCode];
        if (room && room.game) {
            const player = room.players.find(p => p.username === data.username);
            if (player) { player.id = socket.id; if (player.isHost) room.hostId = socket.id; }

            io.to(data.roomCode).emit('updatePlayers', room.players);
            room.game.playersLoaded = (room.game.playersLoaded || 0) + 1;

            if (room.game.currentDrawerIndex !== -1 && room.game.currentWord === '') {
                const drawer = room.players[room.game.currentDrawerIndex];
                const choices = (drawer.id === socket.id) ? room.game.wordChoices : [];
                socket.emit('turnStarting', { drawerId: drawer.id, drawerName: drawer.username, round: room.game.round, totalRounds: room.settings.rounds, wordMode: room.settings.wordMode, wordChoices: choices });
            }

            if (room.game.playersLoaded === room.players.length && room.game.currentDrawerIndex === -1) {
                if (room.game.fallbackTimer) clearTimeout(room.game.fallbackTimer);
                room.isTransitioning = false;
                startNextTurn(io, data.roomCode);
            }
        }
    });

    socket.on('wordSelected', (data) => {
        const room = roomsData[data.roomCode];
        if (room && room.game.drawerId === socket.id) {
            room.game.currentWord = data.word.toUpperCase();
            
            io.to(data.roomCode).emit('startDrawingPhase', { blanks: getBlanks(room.game.currentWord) });
            socket.emit('youAreDrawing', room.game.currentWord);
            io.to(data.roomCode).emit('onClear');

            room.game.timeLeft = room.settings.time;
            if (room.game.timer) clearInterval(room.game.timer); 

            room.game.timer = setInterval(() => {
                room.game.timeLeft--;
                io.to(data.roomCode).emit('timeUpdate', room.game.timeLeft); 

                if (room.game.timeLeft <= 0) {
                    clearInterval(room.game.timer);
                    io.to(data.roomCode).emit('chatMessage', { username: 'System', text: `⏰ Time's up! The word was: ${room.game.currentWord}`, type: 'system' });
                    setTimeout(() => { startNextTurn(io, data.roomCode); }, 4000);
                }
            }, 1000);
        }
    });

    socket.on('draw', (data) => socket.to(data.roomCode).emit('onDraw', data));
    socket.on('fill', (data) => socket.to(data.roomCode).emit('onFill', data));
    socket.on('clear', (roomCode) => socket.to(roomCode).emit('onClear'));
    socket.on('syncCanvas', (data) => socket.to(data.roomCode).emit('onSyncCanvas', data.image));

    socket.on('disconnect', () => {
        for (const roomCode in roomsData) {
            const room = roomsData[roomCode];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                if (room.isTransitioning) break;

                const leavingPlayer = room.players[playerIndex];
                room.players.splice(playerIndex, 1);
                
                if (room.players.length === 0) {
                    if (room.game && room.game.timer) clearInterval(room.game.timer);
                    delete roomsData[roomCode]; break;
                }
                
                if (leavingPlayer.isHost) {
                    room.players[0].isHost = true; room.hostId = room.players[0].id;
                    io.to(roomCode).emit('chatMessage', { username: 'System', text: `👑 ${room.players[0].username} is the new Host!`, type: 'system' });
                }
                io.to(roomCode).emit('updatePlayers', room.players);
                io.to(roomCode).emit('chatMessage', { username: 'System', text: `🚪 ${leavingPlayer.username} left.`, type: 'system' });
                break;
            }
        }
    });
});

server.listen(3000, () => {
    console.log('🚀 Server running on http://localhost:3000');
});