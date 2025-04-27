import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {}, // Optional: For message recovery
});

// Database setup
const db = await open({
  filename: "chat.db",
  driver: sqlite3.Database,
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE
  );
`);

// Track online users
const onlineUsers = new Map();

io.on("connection", (socket) => {
  // New user joins
  socket.on("new user", async (username) => {
    try {
      await db.run(
        "INSERT OR IGNORE INTO users (id, username) VALUES (?, ?)",
        socket.id,
        username
      );
      onlineUsers.set(socket.id, username);
      updateOnlineUsers();
    } catch (error) {
      console.error("Error adding user:", error);
    }
  });

  // Handle messages
  socket.on("chat message", async (msgData, callback) => {
    try {
      const result = await db.run(
        "INSERT INTO messages (username, content) VALUES (?, ?)",
        msgData.user,
        msgData.text
      );
      io.emit("chat message", {
        ...msgData,
        id: result.lastID,
        timestamp: new Date().toISOString(),
      });
      callback();
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });

  // Handle reactions
  socket.on("react", (reactionData) => {
    io.emit("reaction", reactionData);
  });

  // User disconnects
  socket.on("disconnect", () => {
    onlineUsers.delete(socket.id);
    updateOnlineUsers();
  });

  function updateOnlineUsers() {
    io.emit("user update", Array.from(onlineUsers.values()));
  }
});

// Serve static files
app.use(express.static("public"));

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
