<<<<<<< HEAD
const mongoose = require('mongoose');

const jadwalSchema = new mongoose.Schema({
  waktu: {
    type: String,
    required: true,
    match: /^\d{2}:\d{2}$/,
    unique: true
  }
});

module.exports = mongoose.model('Jadwal', jadwalSchema);
=======
const mongoose = require('mongoose');

const jadwalSchema = new mongoose.Schema({
  waktu: {
    type: String,
    required: true,
    match: /^\d{2}:\d{2}$/,
    unique: true
  }
});

module.exports = mongoose.model('Jadwal', jadwalSchema);
>>>>>>> 93a4cc7334f28dfd670f5810a1ed4250d0f474ff
