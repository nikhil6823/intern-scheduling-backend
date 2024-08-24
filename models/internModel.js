// internModel.js
const mongoose = require('mongoose');
const Leave = require('./leaveSchema');

const internSchema = new mongoose.Schema({
  username: String,
  phonenumber: String,
  contact: String,
  email: String,
  password: String,
  domain: { type: String, default: '' },
  leaveRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Leave' }],
});

const Intern = mongoose.model('Intern', internSchema);

module.exports = Intern;
