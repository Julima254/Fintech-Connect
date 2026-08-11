const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SaccoMember"
        // not required — only present for SACCO-related transactions
    },
    amount: {
        type: Number,
        required: true
    },
    code: {
        type: String,
        unique: true,
        sparse: true
    },
    type: {
        type: String,
        enum: [
            "deposit",
            "withdrawal",
            "referral",
            "task",
            "shares",
            "registration_fee",
            "loan_disbursement",
            "loan_repayment",
            "dividend"
        ],
        default: "deposit"
    },
    method: {
        type: String,
        enum: ["stk", "manual"],
        default: "stk"
    },
    status: {
        type: String,
        enum: ["pending", "completed", "failed"],
        default: "pending"
    },
    checkoutRequestID: {
        type: String
    },
    description: {
        type: String
    },
    balanceAfter: {
        type: Number
    }
}, { timestamps: true });

transactionSchema.index({ member: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);