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
