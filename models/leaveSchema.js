// leaveSchema.js
const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  internName: String, 
  reason: String,
  startDate: String,
  endDate: String,
  nominatedIntern: String,
  internStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
});

const Leave = mongoose.model('Leave', leaveSchema);

module.exports = Leave;
