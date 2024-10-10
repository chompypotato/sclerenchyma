require("dotenv").config(); // Load environment variables from .env
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");
const multer = require("multer"); // Import multer for file uploads
const emoji = require("node-emoji"); // Import node-emoji
const fs = require("fs"); // Import filesystem module for file deletion

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads"); // Set the upload destination
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname); // Keep the original file name
  },
});
const upload = multer({ storage }); // Create the multer instance

// Middleware to serve static files and parse JSON request bodies
app.use(express.static("public"));
app.use(express.json()); // To handle JSON data in POST requests

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Chat room data
const chatRooms = {
  General: [],
  Random: [],
  Tech: [],
  Suggestions: [],
  Games: [],
};

// Admin users (admin privilege management)
const adminUsers = new Set(); // Dynamically add users who verify as admins

// Spam prevention variables
const spamLimitTime = 2000; // 2 seconds limit between messages
const userLastMessageTime = {}; // Object to track the last message time for each user

// Socket.IO connections and message handling
io.on("connection", (socket) => {
  let currentRoom = "General"; // Default room
  socket.join(currentRoom);
  socket.emit("message history", chatRooms[currentRoom]);

  // Handle room switching
  socket.on("switch room", (room) => {
    if (chatRooms[room]) {
      socket.leave(currentRoom);
      currentRoom = room;
      socket.join(currentRoom);
      socket.emit("message history", chatRooms[currentRoom]);
    }
  });

  // Handle incoming chat messages
  socket.on("chat message", (msg) => {
    if (!msg.room || !msg.name || !msg.text) return;

    // Check the last message time for the user
    const now = Date.now();
    const lastMessageTime = userLastMessageTime[msg.name] || 0;

    // If the user sends a message too soon, block it
    if (now - lastMessageTime < spamLimitTime) {
      socket.emit("spam warning", "You are sending messages too quickly. Please wait.");
      return;
    }

    // Update the user's last message time
    userLastMessageTime[msg.name] = now;

    // Use node-emoji to replace emoji codes with emojis
    const messageWithEmojis = emoji.emojify(msg.text); // Convert text with emoji codes

    // Add the modified message with emojis to the chat room history
    chatRooms[msg.room].push({ name: msg.name, text: messageWithEmojis });

    // Limit room history to the last 25 messages
    if (chatRooms[msg.room].length > 25) {
      chatRooms[msg.room].shift();
    }

    // Broadcast message to room
    io.to(msg.room).emit("chat message", { name: msg.name, text: messageWithEmojis });
  });

  // Handle file upload
  socket.on("file upload", (fileData) => {
    const { name, room, filePath } = fileData;

    // Add file information to chat room history
    chatRooms[room].push({ name, text: `File: <a href="${filePath}" target="_blank">${path.basename(filePath)}</a>` });

    // Broadcast file upload message to room
    io.to(room).emit("chat message", { name, text: `File: <a href="${filePath}" target="_blank">${path.basename(filePath)}</a>` });
  });

  // Handle room joining
  socket.on("join room", (room) => {
    if (chatRooms[room]) {
      socket.join(room);
      socket.emit("message history", chatRooms[room]);
    }
  });

  // Handle admin commands
  socket.on("admin command", (msg) => {
    handleAdminCommand(msg, socket);
  });
});

// Function to handle admin commands
function handleAdminCommand(msg, socket) {
  const { text, name, room } = msg;

  if (!adminUsers.has(name)) {
    socket.emit("chat message", {
      name: "system",
      text: "Unauthorized admin command",
    });
    return;
  }

  // Check for the /clear command
  if (text.startsWith("/clear")) {
    chatRooms[room] = []; 
    io.to(room).emit("clearChat"); // Notify all clients in the room
    socket.emit("chat message", {
      name: "system",
      text: `Chat history cleared for room: ${room}`,
    });
  } else {
    socket.emit("chat message", {
      name: "system",
      text: `Unknown admin command: ${text}`,
    });
  }
}

// Admin code verification route
app.post("/verify-admin", (req, res) => {
  const enteredCode = req.body.code;
  const adminCode = process.env.ADMIN_CODE; // Load admin code from .env

  if (enteredCode === adminCode) {
    adminUsers.add(req.body.username); // Add user to admin set
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Handle file uploads via POST request
app.post("/upload", upload.single("file"), (req, res) => {
  const filePath = `/uploads/${req.file.originalname}`;
  const room = req.body.room; // Room from the form data
  const name = req.body.username; // Username from the form data

  // Emit file upload event to the room
  io.to(room).emit("file upload", { name, room, filePath });

  // Schedule file deletion after 5 minutes
  setTimeout(() => {
    const absoluteFilePath = path.join(__dirname, "uploads", req.file.originalname);

    // Check if the file exists before deleting
    fs.unlink(absoluteFilePath, (err) => {
      if (err) {
        console.error(`Failed to delete file: ${absoluteFilePath}`, err);
      } else {
        console.log(`Deleted file: ${absoluteFilePath}`);
      }
    });
  }, 5 * 60 * 1000); // 5 minutes

  res.json({ success: true, filePath }); // Send back the file path
});

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
