const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log(`\nNode Connected LESSGOOOOOOOOOO: ${socket.id}`);

  // DATA IS CUMING 💀
  socket.on('mobile_data_stream', (data) => {
    
    // juts assign variables
    const lat = typeof data.latitude === 'number' ? data.latitude.toFixed(5) : '0.00000';
    const lon = typeof data.longitude === 'number' ? data.longitude.toFixed(5) : '0.00000';
    const y = typeof data.yaw === 'number' ? data.yaw.toFixed(3) : '0.000';
    const p = typeof data.pitch === 'number' ? data.pitch.toFixed(3) : '0.000';
    const r = typeof data.roll === 'number' ? data.roll.toFixed(3) : '0.000';

    process.stdout.write(`\r📡 LIVE | Lat: ${lat} | Lon: ${lon} | Yaw: ${y} | Pitch: ${p} | Roll: ${r}      `);

    // sends to all the extenssions connected all together.
    // REMOVE THE SHIT WHEN SCALING...ELSE ITLL SHAKE EVERYONE'S AT THE SAME TIME FROM ONE PHONE 💀
    socket.broadcast.emit('mobile_data_stream', data);
  });

  // disconnected
  socket.on('disconnect', () => {
    console.log(`\nNode Disconnected: ${socket.id}`);
  });
});

// CHANGE THE SHIT IN ENV later
const PORT = 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TELEMETRY RELAY SERVER ONLINE 😉`);
  console.log(`\n`);
  console.log(`Listening for mobile stream on port ${PORT}...\n`);
});