const mongoose = require("mongoose");

const saccoMemberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  fullName:   { type: String, required: true },
  idNumber:   { type: String, required: true },
  phone:      { type: String, required: true },
  email:      { type: String, required: true },
  occupation: { type: String, required: true },
  termsAcceptedAt: { type: Date },
  registrationFeePaid: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },

  // --- Dashboard fields ---
  availableSavings:  { type: Number, default: 0 },
  lockedSavings:      { type: Number, default: 0 },
  totalShares:        { type: Number, default: 0 },
  shareValue:         { type: Number, default: 0 }, // KES per share
  referralEarnings:   { type: Number, default: 0 },
  totalDividends:     { type: Number, default: 0 },
  loanLimit:           { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model("SaccoMember", saccoMemberSchema);