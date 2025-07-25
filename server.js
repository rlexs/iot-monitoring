// ✅ server.js – Full backend dengan Socket.IO, MongoDB, REST API
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketio = require('socket.io');
const os = require('os');
const sendTelegramAlert = require('./utils/telegram');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// ==== Middleware ====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==== Fungsi Ambil IP Otomatis ====
function getIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// ==== MongoDB Connection ====
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB terkoneksi");

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      const ip = getIPAddress();
      console.log(`🚀 Server jalan di http://${ip}:${PORT}`);
    });
  })
  .catch(err => console.error("❌ Gagal konek MongoDB:", err));

// ==== Socket.IO Logging (optional debugging) ====
io.on('connection', (socket) => {
  console.log('🔌 Socket.IO client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('❌ Socket.IO client disconnected:', socket.id);
  });
});

// ==== Import dan Gunakan Routes ====
const sensorRoutes = require('./routes/sensorRoutes')(io);
app.use('/api/sensor', sensorRoutes);
