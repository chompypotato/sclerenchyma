require('dotenv').config();  // Load environment variables from .env

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware to serve static files and parse JSON request bodies
app.use(express.static('public'));
app.use(express.json());  // To handle JSON data in POST requests

// Chat room data
const chatRooms = {
    'General': [],
    'Random': [],
    'Tech': [],
    'Suggestions': [],
  'Games':[]
};

// Admin users (admin privilege management)
const adminUsers = new Set();  // Dynamically add users who verify as admins

// Socket.IO connections and message handling
io.on('connection', (socket) => {
    let currentRoom = 'General';  // Default room
    socket.join(currentRoom);
    socket.emit('message history', chatRooms[currentRoom]);

    // Handle room switching
    socket.on('switch room', (room) => {
        if (chatRooms[room]) {
            socket.leave(currentRoom);
            currentRoom = room;
            socket.join(currentRoom);
            socket.emit('message history', chatRooms[currentRoom]);
        }
    });

    // Handle incoming chat messages
    socket.on('chat message', (msg) => {
        if (!msg.room || !msg.name || !msg.text) return;

        // Handle admin commands (starts with '/')
        if (msg.text.startsWith('/')) {
            handleAdminCommand(msg, socket);
        } else {
            // Add message to room's history
            chatRooms[msg.room].push({ name: msg.name, text: msg.text });

            // Limit room history to the last 25 messages
            if (chatRooms[msg.room].length > 25) {
                chatRooms[msg.room].shift();
            }

            // Broadcast message to room
            io.to(msg.room).emit('chat message', { name: msg.name, text: msg.text });
        }
    });

    // Handle room joining
    socket.on('join room', (room) => {
        if (chatRooms[room]) {
            socket.join(room);
            socket.emit('message history', chatRooms[room]);
        }
    });
});

// Function to handle admin commands
function handleAdminCommand(msg, socket) {
    const { text, name, room } = msg;

    if (!adminUsers.has(name)) {
        socket.emit('chat message', { name: 'system', text: 'Unauthorized admin command' });
        return;
    }

    const [command] = text.split(' ');  // Extract the command
    switch (command) {
        case '/clear':
            chatRooms[room] = [];  // Clear chat history for the room
            io.to(room).emit('clearChat');  // Emit clearChat event to the room
            break;

        // Add more commands here if needed (e.g., /kick, /ban)
        default:
            socket.emit('chat message', { name: 'system', text: `Unknown command: ${command}` });
            break;
    }
}

// Admin code verification route
app.post('/verify-admin', (req, res) => {
    const enteredCode = req.body.code;
    const adminCode = process.env.ADMIN_CODE;  // Load admin code from .env

    if (enteredCode === adminCode) {
        adminUsers.add(req.body.username);  // Add user to admin set
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
