const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema({
  user:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: "SaccoMember", required: true },
  principal:          { type: Number, required: true },
  outstandingBalance: { type: Number, required: true },
  interestRate:       { type: Number, default: 0 }, // % flat or annual, your call
  status: {
    type: String,
    enum: ["pending", "active", "completed", "defaulted", "rejected"],
    default: "pending"
  },
  disbursedAt: { type: Date },
  dueDate:     { type: Date }
}, { timestamps: true });

module.exports = mongoose.model("Loan", loanSchema);