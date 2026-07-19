const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Initialize Express and HTTP Server
const app = express();
app.use(cors());
const server = http.createServer(app);

// Initialize Socket.IO with relaxed CORS for local development
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Listen for incoming socket connections
io.on('connection', (socket) => {
  console.log(`\n🟢 Node Connected: ${socket.id}`);

  // Listen for the telemetry stream emitted by the Expo mobile app
  socket.on('mobile_data_stream', (data) => {
    
    // 1. Safely format the incoming data to a fixed number of decimal places
    const lat = typeof data.latitude === 'number' ? data.latitude.toFixed(5) : '0.00000';
    const lon = typeof data.longitude === 'number' ? data.longitude.toFixed(5) : '0.00000';
    const y = typeof data.yaw === 'number' ? data.yaw.toFixed(3) : '0.000';
    const p = typeof data.pitch === 'number' ? data.pitch.toFixed(3) : '0.000';
    const r = typeof data.roll === 'number' ? data.roll.toFixed(3) : '0.000';

    // 2. Log it in-place using \r to prevent terminal scrolling spam
    process.stdout.write(`\r📡 LIVE | Lat: ${lat} | Lon: ${lon} | Yaw: ${y} | Pitch: ${p} | Roll: ${r}      `);

    // 3. Broadcast the exact data object to the desktop app(s)
    socket.broadcast.emit('mobile_data_stream', data);
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log(`\n🔴 Node Disconnected: ${socket.id}`);
  });
});

// Define the port (matching the 3000 port in your mobile app)
const PORT = 3000;

// '0.0.0.0' binds the server to the local network IP
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================`);
  console.log(`📡 TELEMETRY RELAY SERVER ONLINE`);
  console.log(`======================================`);
  console.log(`Listening for mobile stream on port ${PORT}...\n`);
});