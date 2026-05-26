// ==========================================
// UNIVERSAL SOUND & MUSIC ENGINE
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Load their setting (or default to SFX Only)
let audioState = sessionStorage.getItem('audioState') ? parseInt(sessionStorage.getItem('audioState')) : 0; 

// Create a Floating Button for ALL screens!
const audioBtn = document.createElement('button');
audioBtn.innerHTML = audioState === 0 ? '🔊' : (audioState === 1 ? '🎵' : '🔇');
audioBtn.style.cssText = "position:fixed; bottom:20px; left:20px; z-index:9999; font-size:1.5rem; background:rgba(0,0,0,0.7); border:2px solid #a100f2; border-radius:50%; width:55px; height:55px; cursor:pointer; box-shadow: 0 0 15px #a100f2; display: flex; justify-content: center; align-items: center;";
document.body.appendChild(audioBtn);

let bgmSequence;
let noteIndex = 0;
const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63]; // Beautiful relaxing arpeggio notes

function playTone(freq, type, startTime, duration, vol) {
    if (audioState === 2) return; // Muted!
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0, startTime); gain.gain.linearRampToValueAtTime(vol, startTime + 0.05); gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(startTime); osc.stop(startTime + duration);
}

// Attach playSound to the window so ALL files can use it!
window.playSound = function(type) {
    if (audioCtx.state === 'suspended') return; // Browser blocked it until they tap
    const now = audioCtx.currentTime;
    
    if (type === 'tick') playTone(800, 'square', now, 0.05, 0.05); // High-pitched, sharp tick so you actually hear it!
    else if (type === 'ding') { playTone(523.25, 'sine', now, 0.6, 0.15); playTone(659.25, 'sine', now + 0.1, 0.6, 0.15); }
    else if (type === 'start') { playTone(440, 'sine', now, 0.5, 0.1); playTone(554.37, 'sine', now + 0.15, 0.5, 0.1); playTone(659.25, 'sine', now + 0.3, 0.8, 0.1); }
    else if (type === 'pop') playTone(800, 'sine', now, 0.1, 0.05); 
    else if (type === 'close') { playTone(400, 'triangle', now, 0.3, 0.1); playTone(450, 'triangle', now + 0.15, 0.3, 0.1); }
    else if (type === 'enter') { playTone(300, 'sine', now, 0.2, 0.1); playTone(400, 'sine', now + 0.1, 0.3, 0.1); playTone(500, 'sine', now + 0.2, 0.5, 0.1); }
    else if (type === 'gameover') { playTone(300, 'sawtooth', now, 1.0, 0.1); playTone(150, 'sawtooth', now + 0.5, 1.5, 0.1); }
}

function startMusic() {
    if (bgmSequence) clearInterval(bgmSequence);
    bgmSequence = setInterval(() => {
        if (audioCtx.state === 'suspended') return;
        playTone(notes[noteIndex], 'sine', audioCtx.currentTime, 0.4, 0.03); // Very soft background music loop
        noteIndex = (noteIndex + 1) % notes.length;
    }, 400); // Plays a note every 400ms
}

function stopMusic() {
    if (bgmSequence) clearInterval(bgmSequence);
    bgmSequence = null;
}

audioBtn.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    audioState = (audioState + 1) % 3;
    sessionStorage.setItem('audioState', audioState);
    
    if (audioState === 0) { audioBtn.innerHTML = '🔊'; stopMusic(); playSound('pop'); }
    else if (audioState === 1) { audioBtn.innerHTML = '🎵'; startMusic(); }
    else if (audioState === 2) { audioBtn.innerHTML = '🔇'; stopMusic(); }
});

// The browser requires ONE click anywhere on the screen to unlock audio!
document.body.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (audioState === 1 && !bgmSequence) startMusic();
}, { once: true });

// Play screen entry sound!
setTimeout(() => { if (audioCtx.state === 'running') playSound('enter'); }, 300);