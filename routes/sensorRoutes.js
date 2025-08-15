// routes/sensorRoutes.js - FULL CODE dengan Display Endpoint
const express = require('express');
const Sensor = require('../models/sensorModel');
const Jadwal = require('../models/jadwalModel');
const chalk = require('chalk');
const sendTelegramAlert = require('../utils/telegram');
let lastFeedTime = null;

// ✅ ANTI-SPAM TELEGRAM: Cooldown 5 menit per alert type
let lastAlertTime = {
  suhu: 0,
  pakan: 0,
  combined: 0  // ✅ untuk alert gabungan
};
const ALERT_COOLDOWN = 5 * 60 * 1000; // 5 menit = 300,000 ms

// ✅ Tracking jadwal execution untuk debugging
let scheduleExecutionLog = [];

const log = {
  success: (msg) => console.log(chalk.greenBright(`✅ ${msg}`)),
  error: (msg) => console.log(chalk.redBright(`❌ ${msg}`)),
  info: (msg) => console.log(chalk.cyanBright(`ℹ️  ${msg}`)),
  warning: (msg) => console.log(chalk.yellowBright(`⚠️  ${msg}`)),
  socket: (msg) => console.log(chalk.magentaBright(`🔌 ${msg}`)),
  feeding: (msg) => console.log(chalk.blueBright(`🍽️  ${msg}`)),
};

module.exports = function(io) {
  const router = express.Router();

  // ✅ NEW: Socket.IO connection handler untuk display data
  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    
    // Handler untuk display data jika ESP32 kirim via Socket.IO direct
    socket.on('display-data', (data) => {
      try {
        const parsedData = JSON.parse(data);
        log.info(`📺 Display data via Socket: Suhu ${parsedData.suhu}°C, Pakan ${parsedData.pakan_cm}cm`);
        
        // Broadcast ke semua client untuk update UI real-time
        io.emit('sensor-update', parsedData);
        log.socket('Display data broadcasted to all clients via Socket.IO');
      } catch (error) {
        log.error(`Error parsing display data: ${error.message}`);
      }
    });
    
    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
    });
  });

  // ✅ NEW: Endpoint untuk display data (1 detik interval dari ESP32)
  router.post('/display', (req, res) => {
    try {
      const { suhu, pakan_cm, waktu, display_only } = req.body;
      
      // ✅ Minimal logging untuk avoid spam (karena 1 detik interval)
      // log.info(`📺 Display: ${suhu}°C, ${pakan_cm}cm, ${waktu}`);

      // Validasi data
      if (suhu === undefined || pakan_cm === undefined || !waktu) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
      }

      // ✅ Emit data ke frontend via Socket.IO (TIDAK DISIMPAN ke database)
      const displayData = {
        suhu,
        pakan_cm,
        waktu,
        display_only: true,
        createdAt: new Date().toISOString()
      };
      
      io.emit('sensor-update', displayData);
      // log.socket('Display data broadcasted (not saved to DB)'); // Comment untuk kurangi spam

      res.status(200).json({ 
        message: 'Display data received and broadcasted',
        saved_to_db: false
      });

    } catch (err) {
      log.error(`Error handle display data: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // GET: Ambil data sensor terbaru (untuk load pertama kali)
  router.get('/current', async (req, res) => {
    try {
      const latestData = await Sensor.findOne().sort({ createdAt: -1 });
      if (latestData) {
        log.info('Data sensor terbaru dikirim ke frontend');
        res.json(latestData);
      } else {
        res.json({ suhu: 0, pakan_cm: 0, waktu: '--:--' });
      }
    } catch (err) {
      log.error(`Error ambil data terbaru: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST: Simpan data sensor (setiap 3 menit dari ESP32)
  router.post('/kirim', async (req, res) => {
    try {
      const { suhu, pakan_cm, waktu } = req.body;
      
      log.info(`Data database diterima - Suhu: ${suhu}°C, Pakan: ${pakan_cm}cm, Waktu: ${waktu}`);

      // Validasi data
      if (suhu === undefined || pakan_cm === undefined || !waktu) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
      }

      // Simpan ke database
      const saved = await Sensor.create({ suhu, pakan_cm, waktu });
      log.success(`Data sensor disimpan ke database`);

      // ✅ Emit data ke frontend via Socket.IO (untuk chart update)
      io.emit('sensor-update', saved);
      log.socket('Data sensor dikirim ke frontend via Socket.IO');

      // ✅ Cek kondisi alert sesuai requirement buzzer
      try {
        const now = Date.now();
        const suhuAbnormal = (suhu < 20 || suhu > 32);
        const pakanHabis = (pakan_cm > 13,5); // >13cm = pakan habis

        // ✅ Alert gabungan (suhu + pakan) = prioritas tertinggi
        if (suhuAbnormal && pakanHabis) {
          if (now - lastAlertTime.combined > ALERT_COOLDOWN) {
            const alertMessage = `🚨 *ALERT KRITIS - GABUNGAN!*\n\n` +
                                `🌡️ Suhu: ${suhu}°C (${suhu < 20 ? 'Terlalu Dingin' : 'Terlalu Panas'})\n` +
                                `📦 Pakan: ${pakan_cm} cm (HABIS)\n` +
                                `⏰ Waktu: ${waktu}\n\n` +
                                `⚠️ PERHATIAN: Kondisi kritis terdeteksi!\n` +
                                `🔊 ESP32 telah bunyi buzzer 2x`;
            
            await sendTelegramAlert(alertMessage);
            lastAlertTime.combined = now;
            lastAlertTime.suhu = now; // Reset individual timers
            lastAlertTime.pakan = now;
            log.warning(`✅ Alert GABUNGAN dikirim: Suhu ${suhu}°C + Pakan ${pakan_cm}cm`);
          }
        } 
        // ✅ Alert individual (hanya telegram, tanpa buzzer di ESP32)
        else {
          // Alert suhu saja
          if (suhuAbnormal && now - lastAlertTime.suhu > ALERT_COOLDOWN) {
            const alertMessage = `🚨 *ALERT SUHU TIDAK NORMAL!*\n\n` +
                                `🌡️ Suhu: ${suhu}°C\n` +
                                `⏰ Waktu: ${waktu}\n\n` +
                                `${suhu < 20 ? '❄️ Suhu terlalu dingin!' : '🔥 Suhu terlalu panas!'}`;
            
            await sendTelegramAlert(alertMessage);
            lastAlertTime.suhu = now;
            log.warning(`✅ Alert suhu dikirim: ${suhu}°C`);
          }

          // Alert pakan saja
          if (pakanHabis && now - lastAlertTime.pakan > ALERT_COOLDOWN) {
            const alertMessage = `⚠️ *PAKAN HAMPIR HABIS!*\n\n` +
                                `📦 Jarak sensor: ${pakan_cm} cm\n` +
                                `⏰ Waktu: ${waktu}\n\n` +
                                `🐟 Segera isi ulang pakan ikan!`;
            
            await sendTelegramAlert(alertMessage);
            lastAlertTime.pakan = now;
            log.warning(`✅ Alert pakan dikirim: ${pakan_cm}cm`);
          }
        }
      } catch (telegramError) {
        log.error(`Error kirim alert Telegram: ${telegramError.message}`);
      }

      res.status(201).json({ 
        message: 'Data berhasil disimpan',
        data: saved 
      });

    } catch (err) {
      log.error(`Error simpan data sensor: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // GET: Ambil log data sensor untuk chart
  router.get('/logs', async (req, res) => {
    try {
      const jam = parseInt(req.query.jam || '1');
      const batas = new Date(Date.now() - jam * 60 * 60 * 1000);
      const logs = await Sensor.find({ createdAt: { $gte: batas } })
                              .sort({ createdAt: -1 });
      
      log.info(`Log data sensor diambil (${jam} jam terakhir), total: ${logs.length}`);
      res.json(logs);
    } catch (err) {
      log.error(`Error ambil logs: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ✅ POST: Pemberian pakan manual dengan buzzer notification
  router.post('/manual', (req, res) => {
    try {
      // ✅ Kirim signal ke ESP32 dengan buzzer 1x beep
      io.emit('beri-pakan', { source: 'manual', buzzer: 1 });
      lastFeedTime = new Date();
      
      // Log untuk debugging
      log.feeding('📦 Pakan manual dikirim dari web - Buzzer 1x beep');
      scheduleExecutionLog.push({
        type: 'manual',
        time: new Date().toLocaleTimeString('id-ID'),
        source: 'website_button'
      });
      
      res.json({ 
        message: 'Pakan manual berhasil dikirim',
        buzzer: '1x beep',
        time: lastFeedTime.toLocaleTimeString('id-ID')
      });
    } catch (err) {
      log.error(`Error pakan manual: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // POST: Tambah jadwal otomatis
  router.post('/jadwal', async (req, res) => {
    try {
      const { jadwal } = req.body;
      
      // Validasi format waktu
      if (!/^\d{2}:\d{2}$/.test(jadwal)) {
        return res.status(400).json({ error: 'Format waktu harus HH:MM' });
      }

      await Jadwal.create({ waktu: jadwal });
      log.success(`Jadwal ditambahkan: ${jadwal}`);
      
      // ✅ Notify ESP32 tentang update jadwal
      io.emit('jadwal-updated', { action: 'added', waktu: jadwal });
      log.socket(`Jadwal update dikirim ke ESP32: ${jadwal}`);
      
      res.json({ message: '✅ Jadwal berhasil disimpan' });
    } catch (err) {
      if (err.code === 11000) {
        log.error(`Jadwal sudah ada: ${req.body.jadwal}`);
        res.status(400).json({ error: 'Jadwal sudah ada' });
      } else {
        log.error(`Error simpan jadwal: ${err.message}`);
        res.status(500).json({ error: err.message });
      }
    }
  });

  // GET: Ambil semua jadwal
  router.get('/jadwal', async (req, res) => {
    try {
      const semua = await Jadwal.find({}).sort('waktu');
      log.info(`Jumlah jadwal saat ini: ${semua.length}`);
      res.json(semua.map(j => j.waktu));
    } catch (err) {
      log.error(`Error ambil jadwal: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE: Hapus satu jadwal
  router.delete('/jadwal', async (req, res) => {
    try {
      const { jadwal } = req.body;
      const result = await Jadwal.deleteOne({ waktu: jadwal });
      
      if (result.deletedCount > 0) {
        log.warning(`Jadwal dihapus: ${jadwal}`);
        
        // ✅ Notify ESP32 tentang penghapusan jadwal
        io.emit('jadwal-updated', { action: 'deleted', waktu: jadwal });
        log.socket(`Jadwal delete dikirim ke ESP32: ${jadwal}`);
        
        res.json({ message: '🗑️ Jadwal berhasil dihapus' });
      } else {
        res.status(404).json({ error: 'Jadwal tidak ditemukan' });
      }
    } catch (err) {
      log.error(`Error hapus jadwal: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ✅ POST: Log feeding dari ESP32
  router.post('/feeding-log', async (req, res) => {
    try {
      const { source, waktu, timestamp } = req.body;
      
      scheduleExecutionLog.push({
        type: source,
        time: waktu,
        timestamp: timestamp,
        received_at: new Date().toLocaleTimeString('id-ID')
      });
      
      log.feeding(`Feeding log diterima: ${source} pada ${waktu}`);
      
      // Broadcast ke frontend untuk update real-time
      io.emit('feeding-executed', {
        source: source,
        time: waktu,
        timestamp: timestamp
      });
      
      res.json({ message: 'Feeding log received' });
    } catch (err) {
      log.error(`Error feeding log: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ✅ POST: Update status jadwal dari ESP32
  router.post('/jadwal-status', (req, res) => {
    try {
      const { waktu, executed, timestamp } = req.body;
      
      log.feeding(`Jadwal ${waktu} executed: ${executed} pada ${new Date(timestamp).toLocaleTimeString('id-ID')}`);
      
      // Broadcast status ke frontend
      io.emit('jadwal-status-update', {
        waktu: waktu,
        executed: executed,
        timestamp: timestamp
      });
      
      res.json({ message: 'Status updated' });
    } catch (err) {
      log.error(`Error update jadwal status: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ✅ POST: Heartbeat dari ESP32 dengan info lengkap
  router.post('/heartbeat', (req, res) => {
    try {
      const { device, status, uptime, socket_connected, total_schedules, last_executed, current_time } = req.body;
      
      log.info(`💓 ${device}: ${status} | Socket: ${socket_connected} | Jadwal: ${total_schedules} | Last: ${last_executed || 'none'}`);
      
      // Broadcast heartbeat ke frontend untuk monitoring
      io.emit('esp32-heartbeat', {
        device: device,
        status: status,
        uptime: uptime,
        socket_connected: socket_connected,
        total_schedules: total_schedules,
        last_executed: last_executed,
        current_time: current_time,
        server_time: new Date().toLocaleTimeString('id-ID')
      });
      
      res.json({ 
        message: 'Heartbeat received',
        server_time: new Date().toISOString()
      });
    } catch (err) {
      log.error(`Error heartbeat: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ✅ GET: Debug info untuk troubleshooting
  router.get('/debug', (req, res) => {
    try {
      const debugInfo = {
        last_feed_time: lastFeedTime,
        alert_cooldowns: lastAlertTime,
        schedule_execution_log: scheduleExecutionLog.slice(-10), // Last 10 entries
        connected_clients: io.engine.clientsCount,
        server_time: new Date().toLocaleTimeString('id-ID'),
        uptime: process.uptime()
      };
      
      log.info('Debug info dikirim');
      res.json(debugInfo);
    } catch (err) {
      log.error(`Error debug info: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ✅ Periksa jadwal otomatis setiap menit dengan logging yang lebih baik
  setInterval(async () => {
    try {
      const now = new Date();
      const hhmm = now.toTimeString().slice(0, 5); // Format: "07:30"
      const jadwals = await Jadwal.find({ waktu: hhmm });
      
      if (jadwals.length > 0) {
        // Cegah spam dalam 1 menit yang sama
        if (!lastFeedTime || now - lastFeedTime > 60 * 1000) {
          
          // ✅ Kirim signal dengan info bahwa ini auto feeding (tanpa buzzer)
          io.emit('beri-pakan', { 
            source: 'auto', 
            buzzer: 0,  // Tidak bunyi buzzer untuk auto feeding
            schedule_time: hhmm 
          });
          
          lastFeedTime = now;
          
          // Log execution
          scheduleExecutionLog.push({
            type: 'auto',
            time: hhmm,
            triggered_at: now.toLocaleTimeString('id-ID'),
            socket_sent: true
          });
          
          log.feeding(`⏰ Pakan otomatis dikirim: ${hhmm} (tanpa buzzer)`);
          log.socket(`Signal 'beri-pakan' dikirim ke ESP32 untuk jadwal ${hhmm}`);
          
          // Notify frontend tentang auto feeding
          io.emit('auto-feeding-triggered', {
            schedule_time: hhmm,
            triggered_at: now.toLocaleTimeString('id-ID')
          });
          
        } else {
          const timeDiff = Math.ceil((60 * 1000 - (now - lastFeedTime)) / 1000);
          log.info(`⏳ Jadwal ${hhmm} di-skip (cooldown ${timeDiff}s)`);
        }
      }
      
      // ✅ Debug log setiap 10 menit untuk monitoring
      if (now.getMinutes() % 10 === 0 && now.getSeconds() === 0) {
        const totalJadwal = await Jadwal.countDocuments();
        log.info(`🕐 Cek jadwal: ${hhmm} | Total jadwal: ${totalJadwal} | Socket clients: ${io.engine.clientsCount}`);
      }
      
    } catch (err) {
      log.error(`Error cek jadwal otomatis: ${err.message}`);
    }
  }, 60 * 1000); // Setiap 1 menit

  // ✅ Cleanup log setiap jam untuk mencegah memory leak
  setInterval(() => {
    if (scheduleExecutionLog.length > 100) {
      scheduleExecutionLog = scheduleExecutionLog.slice(-50); // Keep last 50 entries
      log.info('🧹 Schedule execution log cleaned up');
    }
  }, 60 * 60 * 1000); // Setiap 1 jam

  return router;
};