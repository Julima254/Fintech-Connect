const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  proofImage:  { type: String, default: null },
  proofText:   { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  submittedAt: { type: Date, default: Date.now }
});

const reservationSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reservedAt: { type: Date, default: Date.now }
});

const taskSchema = new mongoose.Schema({
  postedBy:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  taskName:            { type: String, required: true },
  timeLimit:           { type: String, required: true },
  minRequirements:     { type: String, required: true },
  expectedDeliverables:{ type: String, required: true },
  requiresProofImage:  { type: Boolean, default: false },
  numWorkers:          { type: Number, required: true },
  payPerTask:          { type: Number, required: true },
  totalCost:           { type: Number, required: true },
  escrowAmount:        { type: Number, default: 0 },
  approvedCount:       { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },
  reservations: [reservationSchema],
  submissions:  [submissionSchema]
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);