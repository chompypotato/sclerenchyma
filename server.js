const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

const chatRooms = {
    'General': [],
    'Random': [],
    'Tech': [],
  'Test': []
};

io.on('connection', (socket) => {
    let currentRoom = 'General';
    socket.join(currentRoom);
    socket.emit('message history', chatRooms[currentRoom]);

    socket.on('switch room', (room) => {
        if (chatRooms[room]) {
            socket.leave(currentRoom);
            currentRoom = room;
            socket.join(currentRoom);
            socket.emit('message history', chatRooms[currentRoom]);
        }
    });

    socket.on('chat message', (msg) => {
        if (!msg.room || !msg.name || !msg.text) return;
        chatRooms[msg.room].push({ name: msg.name, text: msg.text });
        if (chatRooms[msg.room].length > 25) {
            chatRooms[msg.room].shift();
        }
        io.to(msg.room).emit('chat message', { name: msg.name, text: msg.text });
    });

    socket.on('join room', (room) => {
        if (chatRooms[room]) {
            socket.join(room);
            socket.emit('message history', chatRooms[room]);
        }
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
