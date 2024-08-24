const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  internId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Intern',
    required: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  week: {
    type: Number,
    required: true
  }
});

const Schedule = mongoose.model('Schedule', scheduleSchema);

module.exports = Schedule;
