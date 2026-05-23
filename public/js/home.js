const socket = io(); // Connects this specific page to the server
// --- 1. TWINKLING STARS BACKGROUND (CANVAS) ---
const canvas = document.getElementById('starsCanvas');
const ctx = canvas.getContext('2d');

// Make the canvas fill the whole screen
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const stars = [];

// Create 150 random stars
for (let i = 0; i < 150; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 1.5 + 0.5, // Size of the star
        alpha: Math.random(),              // Brightness
        fadeSpeed: Math.random() * 0.03 + 0.01 // How fast it twinkles
    });
}

// Function to animate the stars
function animateStars() {
    // Clear the screen every frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let star of stars) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.fill();

        // Make the star twinkle (fade in and out)
        star.alpha += star.fadeSpeed;
        if (star.alpha >= 1 || star.alpha <= 0) {
            star.fadeSpeed *= -1; // Reverse the fading direction
        }
    }
    // Loop the animation forever
    requestAnimationFrame(animateStars);
}

// Start the star animation
animateStars();

// Adjust canvas if the window is resized
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});


// --- 2. THE CUSTOM ROBOT AVATAR BUILDER ---
const avatarDisplay = document.getElementById('avatarDisplay');

// Among Us Colors (Hex codes without the '#' for the API)
const colors = [
    'c51111', '132ed1', '117f2d', 'ed54ba', 'f07d0d', 'f5f557', 
    '3f474e', 'd6e0f0', '6b2fbb', '71491e', '38fedc', '50ef39'
];

// 8 Different Robot Eyes!
const eyes = [
    'happy',      // 1
    'hearts',     // 2
    'bulging',    // 3
    'dizzy',      // 4
    'eva',        // 5
    'robocop',    // 6
    'round',      // 7
    'sensor'      // 8
];

// 8 Different Robot Mouths!
const mouths = [
    'smile01',    // 1
    'smile02',    // 2
    'bite',       // 3
    'diagram',    // 4
    'grill01',    // 5
    'grill02',    // 6
    'square01',   // 7
    'square02'    // 8
];

let cIdx = 0; // Color Index
let eIdx = 0; // Eyes Index
let mIdx = 0; // Mouth Index

function renderAvatar() {
    // We build the custom URL using your selected parts
    // We also use your CodePen's gradient background rotation tricks!
    const apiUrl = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=skribbl&backgroundColor=${colors[cIdx]}&eyes=${eyes[eIdx]}&mouth=${mouths[mIdx]}&backgroundType=gradientLinear&backgroundRotation=10,20,30,280`;
    
    // Add the image tag to our HTML container
    avatarDisplay.innerHTML = `<img src="${apiUrl}" alt="Avatar">`;
}

// Controls logic
function setupControls(type, maxLen, updateLogic) {
    document.getElementById(`prev${type}`).addEventListener('click', () => {
        updateLogic(-1, maxLen);
        renderAvatar();
    });
    document.getElementById(`next${type}`).addEventListener('click', () => {
        updateLogic(1, maxLen);
        renderAvatar();
    });
}

setupControls('Color', colors.length, (dir, len) => { cIdx = (cIdx + dir + len) % len; });
setupControls('Eyes', eyes.length, (dir, len) => { eIdx = (eIdx + dir + len) % len; });
setupControls('Mouth', mouths.length, (dir, len) => { mIdx = (mIdx + dir + len) % len; });

// Draw the first avatar when page loads
renderAvatar();

// --- 3. THE SMART BUTTON & SERVER LOGIC ---

// Grab the elements
const usernameInput = document.getElementById('usernameInput');
const roomCodeInput = document.getElementById('roomCodeInput'); // We added this!
const mainBtn = document.getElementById('createGameBtn');

// THE SMART BUTTON: Watch the Room Code box
roomCodeInput.addEventListener('input', () => {
    // If there is ANY text in the box, change the button to JOIN
    if (roomCodeInput.value.trim() !== '') {
        mainBtn.innerHTML = '<span>JOIN ROOM</span>';
    } else {
        // If the box is empty, change it back to CREATE
        mainBtn.innerHTML = '<span>CREATE ROOM</span>';
    }
});

// THE CLICK LOGIC
mainBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomCode = roomCodeInput.value.trim();

    // Check if the name is empty
    if (username === '') {
        alert('Please enter a name first!');
        usernameInput.focus();
        return; 
    }

    // Bundle up the player's data
    const playerData = {
        username: username,
        avatar: {
            color: colors[cIdx],
            eyes: eyes[eIdx],
            mouth: mouths[mIdx]
        }
    };

    // Are we Creating or Joining? Check the button text!
    if (mainBtn.textContent.includes('JOIN')) {
        // We are joining! Add the room code to the package
        playerData.roomCode = roomCode;
        socket.emit('joinRoom', playerData);
    } else {
        // We are creating!
        socket.emit('createRoom', playerData);
    }
});


// --- 4. LISTENING FOR THE SERVER ---

// Helper function to save data and go to the lobby (so we don't write it twice!)
function saveDataAndGoToLobby(roomCode) {
    sessionStorage.setItem('username', usernameInput.value.trim());
    sessionStorage.setItem('roomCode', roomCode);
    sessionStorage.setItem('avatarColor', colors[cIdx]);
    sessionStorage.setItem('avatarEyes', eyes[eIdx]);
    sessionStorage.setItem('avatarMouth', mouths[mIdx]);
    
    // Go to the lobby!
    window.location.href = '/lobby.html';
}

// When we successfully create a room
socket.on('roomCreated', (roomCode) => {
    saveDataAndGoToLobby(roomCode);
});

// When we successfully join an existing room
socket.on('roomJoined', (roomCode) => {
    saveDataAndGoToLobby(roomCode);
});

// When we type a wrong room code!
socket.on('roomError', (errorMessage) => {
    alert(errorMessage); // Shows "Room not found!"
    roomCodeInput.value = ''; // Clears the wrong code from the box
    mainBtn.innerHTML = '<span>CREATE ROOM</span>'; // Resets the button
});