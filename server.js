// ✅ server.js – Full backend dengan Socket.IO, MongoDB, REST API
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketio = require('socket.io'); // ✅ Gunakan ini, bukan destructuring
const sendTelegramAlert = require('./utils/telegram');

const app = express();
const server = http.createServer(app);
const io = socketio(server); // ✅ Fix: Ini cara yang benar untuk inisialisasi

// ==== Middleware ====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==== MongoDB Connection ====
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("✅ MongoDB terkoneksi");

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🚀 Server jalan di http://13.214.196.144:${PORT}`);
  });
}).catch(err => console.error("❌ Gagal konek MongoDB:", err));

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
