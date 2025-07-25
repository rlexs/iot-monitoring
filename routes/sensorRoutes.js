// routes/sensorRoutes.js
const express = require('express');
const Sensor = require('../models/sensorModel');
const Jadwal = require('../models/jadwalModel');
const chalk = require('chalk');
const sendTelegramAlert = require('../utils/telegram');
let lastFeedTime = null;

// ✅ ANTI-SPAM TELEGRAM: Cooldown 5 menit per alert type
let lastAlertTime = {
  suhu: 0,
  pakan: 0
};
const ALERT_COOLDOWN = 5 * 60 * 1000; // 5 menit = 300,000 ms

const log = {
  success: (msg) => console.log(chalk.greenBright(`✅ ${msg}`)),
  error: (msg) => console.log(chalk.redBright(`❌ ${msg}`)),
  info: (msg) => console.log(chalk.cyanBright(`ℹ️  ${msg}`)),
  warning: (msg) => console.log(chalk.yellowBright(`⚠️  ${msg}`)),
  socket: (msg) => console.log(chalk.magentaBright(`🔌 ${msg}`)),
};

module.exports = function(io) {
  const router = express.Router();

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

  // POST: Simpan data sensor
  router.post('/kirim', async (req, res) => {
    try {
      const { suhu, pakan_cm, waktu } = req.body;
      
      log.info(`Data diterima - Suhu: ${suhu}°C, Pakan: ${pakan_cm}cm, Waktu: ${waktu}`);

      // Validasi data
      if (suhu === undefined || pakan_cm === undefined || !waktu) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
      }

      // Simpan ke database
      const saved = await Sensor.create({ suhu, pakan_cm, waktu });
      log.success(`Data sensor disimpan ke database`);

      // ✅ Emit data ke frontend via Socket.IO
      io.emit('sensor-update', saved);
      log.socket('Data sensor dikirim ke frontend via Socket.IO');

      // ✅ Cek kondisi alert dan kirim ke Telegram (DENGAN ANTI-SPAM)
      try {
        const now = Date.now();

        // ✅ Alert suhu tidak normal (dengan cooldown 5 menit)
        if (suhu < 20 || suhu > 32) {
          if (now - lastAlertTime.suhu > ALERT_COOLDOWN) {
            const alertMessage = `🚨 *ALERT SUHU TIDAK NORMAL!*\n\n` +
                                `🌡️ Suhu: ${suhu}°C\n` +
                                `⏰ Waktu: ${waktu}\n\n` +
                                `${suhu < 20 ? '❄️ Suhu terlalu dingin!' : '🔥 Suhu terlalu panas!'}`;
            
            await sendTelegramAlert(alertMessage);
            lastAlertTime.suhu = now;
            log.warning(`✅ Alert suhu dikirim: ${suhu}°C`);
          } else {
            const remainingTime = Math.ceil((ALERT_COOLDOWN - (now - lastAlertTime.suhu)) / 60000);
            log.info(`⏳ Alert suhu di-skip (cooldown ${remainingTime} menit): ${suhu}°C`);
          }
        }

        // ✅ Alert pakan habis (logika: 2cm=full, 13cm=kosong, >12cm=hampir habis)
        if (pakan_cm > 12) {
          if (now - lastAlertTime.pakan > ALERT_COOLDOWN) {
            const alertMessage = `⚠️ *PAKAN HAMPIR HABIS!*\n\n` +
                                `📦 Jarak sensor: ${pakan_cm} cm\n` +
                                `⏰ Waktu: ${waktu}\n\n` +
                                `🐟 Segera isi ulang pakan ikan!`;
            
            await sendTelegramAlert(alertMessage);
            lastAlertTime.pakan = now;
            log.warning(`✅ Alert pakan dikirim: ${pakan_cm}cm`);
          } else {
            const remainingTime = Math.ceil((ALERT_COOLDOWN - (now - lastAlertTime.pakan)) / 60000);
            log.info(`⏳ Alert pakan di-skip (cooldown ${remainingTime} menit): ${pakan_cm}cm`);
          }
        }
      } catch (telegramError) {
        log.error(`Error kirim alert Telegram: ${telegramError.message}`);
        // Jangan return error, biarkan data tetap tersimpan
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

  // POST: Pemberian pakan manual
  router.post('/manual', (req, res) => {
    try {
      io.emit('beri-pakan');
      lastFeedTime = new Date();
      log.warning('📦 Pakan manual dikirim dari web');
      res.json({ message: 'Pakan manual berhasil dikirim' });
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
        res.json({ message: '🗑️ Jadwal berhasil dihapus' });
      } else {
        res.status(404).json({ error: 'Jadwal tidak ditemukan' });
      }
    } catch (err) {
      log.error(`Error hapus jadwal: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // ⏰ Periksa jadwal otomatis setiap menit
  setInterval(async () => {
    try {
      const now = new Date();
      const hhmm = now.toTimeString().slice(0, 5);
      const jadwals = await Jadwal.find({ waktu: hhmm });
      
      if (jadwals.length > 0) {
        // Cegah spam dalam 1 menit yang sama
        if (!lastFeedTime || now - lastFeedTime > 60 * 1000) {
          io.emit('beri-pakan');
          lastFeedTime = now;
          log.success(`⏰ Pakan otomatis dikirim: ${hhmm}`);
        }
      }
    } catch (err) {
      log.error(`Error cek jadwal otomatis: ${err.message}`);
    }
  }, 60 * 1000);

  return router;
};