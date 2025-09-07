<<<<<<< HEAD
const axios = require('axios');
require('dotenv').config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramAlert(message) {
  // Validasi token dan chat ID
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.error('❌ TELEGRAM_TOKEN atau TELEGRAM_CHAT_ID tidak ditemukan di .env');
    return;
  }

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown' // Untuk format bold, italic, dll
      }
    );
    
    console.log('✅ Notifikasi Telegram berhasil dikirim:', message);
    return response.data;
  } catch (error) {
    console.error('❌ Error kirim Telegram:', error.response?.data || error.message);
    throw error;
  }
}

=======
const axios = require('axios');
require('dotenv').config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramAlert(message) {
  // Validasi token dan chat ID
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.error('❌ TELEGRAM_TOKEN atau TELEGRAM_CHAT_ID tidak ditemukan di .env');
    return;
  }

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown' // Untuk format bold, italic, dll
      }
    );
    
    console.log('✅ Notifikasi Telegram berhasil dikirim:', message);
    return response.data;
  } catch (error) {
    console.error('❌ Error kirim Telegram:', error.response?.data || error.message);
    throw error;
  }
}

>>>>>>> 93a4cc7334f28dfd670f5810a1ed4250d0f474ff
module.exports = sendTelegramAlert; // ⚠️ PENTING: Export langsung fungsi, bukan object