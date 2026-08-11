const mongoose = require("mongoose");

const guarantorRequestSchema = new mongoose.Schema({
  loan:            { type: mongoose.Schema.Types.ObjectId, ref: "Loan", required: true },
  borrower:        { type: mongoose.Schema.Types.ObjectId, ref: "SaccoMember", required: true },
  guarantor:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amountGuaranteed:{ type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "accepted", "declined"],
    default: "pending"
  },
  respondedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model("GuarantorRequest", guarantorRequestSchema);