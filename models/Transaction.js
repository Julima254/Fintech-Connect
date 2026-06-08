const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
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
        enum: ["deposit", "withdrawal", "referral", "task", "shares"],
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
    }
}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionSchema);