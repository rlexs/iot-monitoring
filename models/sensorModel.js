<<<<<<< HEAD
const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  suhu: Number,
  pakan_cm: Number,
  waktu: String
}, { timestamps: true });

=======
const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  suhu: Number,
  pakan_cm: Number,
  waktu: String
}, { timestamps: true });

>>>>>>> 93a4cc7334f28dfd670f5810a1ed4250d0f474ff
module.exports = mongoose.model('Sensor', sensorSchema);