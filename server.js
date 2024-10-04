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
app.use(express.json());  // This is crucial to handle JSON data in POST requests

// Chat room data
const chatRooms = {
    'General': [],
    'Random': [],
    'Tech': [],
    'Test': []
};

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
        
        // Add message to room's history
        chatRooms[msg.room].push({ name: msg.name, text: msg.text });
        
        // Limit room history to the last 25 messages
        if (chatRooms[msg.room].length > 25) {
            chatRooms[msg.room].shift();
        }
        
        // Broadcast message to room
        io.to(msg.room).emit('chat message', { name: msg.name, text: msg.text });
    });

    // Handle room joining
    socket.on('join room', (room) => {
        if (chatRooms[room]) {
            socket.join(room);
            socket.emit('message history', chatRooms[room]);
        }
    });
});

// Admin code verification route
app.post('/verify-admin', (req, res) => {
    const enteredCode = req.body.code;  // Read the code from the request body
    const adminCode = process.env.ADMIN_CODE;  // Load admin code from .env

    if (enteredCode === adminCode) {
        res.json({ success: true });  // Respond with success if codes match
    } else {
        res.json({ success: false });  // Respond with failure if codes do not match
    }
});

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
