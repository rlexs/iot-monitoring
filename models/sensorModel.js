const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  suhu: Number,
  pakan_cm: Number,
  waktu: String
}, { timestamps: true });

module.exports = mongoose.model('Sensor', sensorSchema);