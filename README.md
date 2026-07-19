****🎨 Skribbl by Rose ✨****


A beautiful, real-time multiplayer drawing and guessing game inspired by Skribbl.io! Built entirely from scratch, this game features a gorgeous neon glassmorphism UI, an advanced HTML5 Canvas drawing engine, and a synthesized Web Audio engine.

Grab your friends, join a lobby, and see who the true artist is! 🏆


**✨ Features**


🖌️ Advanced Drawing Engine: Not just a pen! Features custom brush styles including Marker, Wet Brush, Neon Highlighter, and a math-based Spray Paint tool.

🪣 Flood Fill & Memory: A fully coded Paint Bucket tool using a custom Flood Fill algorithm, plus full Undo & Redo mechanics.

👾 Custom Robot Avatars: Build your own character using Among Us colors, custom eyes, and mouths. Features a glowing status dot built with pure CSS trigonometry!

🧠 Smart Guessing System: Types the wrong spelling? The server uses Levenshtein Distance math to privately warn players when their guess is "Close!" 🟡

🃏 "Deck of Cards" Word Shuffler: Words are dealt like a deck of cards so you will never see a repeating word until the entire dictionary has been played.

🎭 Two Game Modes: Play 'Normal' mode with provided words, or 'Custom' mode where the Drawer can type their own secret inside-jokes to draw!

🎵 3-Way Audio Synthesizer: A completely custom Audio Engine built with the Web Audio API (No MP3s used!). Toggle between satisfying SFX, a chill procedural ambient music drone, or Muted.

📱 Flawless Mobile Support: Touch-screen drawing, horizontally swiping toolbars, and responsive scaling so you can play perfectly on your phone.

👀 Spectator Dashboard: Guessers get a glowing, bouncing spectator screen featuring randomized funny taunts while waiting for the drawer.


***🛠️ Tech Stack***


Frontend: HTML5, CSS3 (Glassmorphism & Neon UI), Vanilla JavaScript, HTML5 Canvas API, Web Audio API

Backend: Node.js, Express

Multiplayer/Networking: Socket.io (WebSockets)

Avatars: DiceBear Bottts API


**🚀 How to Run Locally**


Want to run this game on your own machine? It's super easy!

***Clone the repository:***

code

Bash

    git clone https://github.com/rimshaaxx/skribbl.git
    cd skribbl

    
*Install dependencies:*

code

Bash

    npm install


*node server.js*

code

Bash

    node server.js


***Play the game!***


Open your web browser and go to http://localhost:3000. (To play with friends over the internet, you can use a tunneling tool like Ngrok or host it on Replit/Render!)


📝 **Adding Custom Words**


Want to add your own words? Simply open words.js and add your favorite words to the array. The server will automatically filter out any duplicates you accidentally type!


<div align="center">
<b>Skribbl ✦ made by Rose</b><br>
</div>
