const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        default: "platform"
    },

    minDeposit: {
        type: Number,
        default: 100
    },

    minWithdrawal: {
        type: Number,
        default: 200
    },

    withdrawalFeePct: {
        type: Number,
        default: 0
    },

    depositInstructions: {
        type: String,
        default: ""
    },

    mpesaPaybill: {
        type: String,
        default: ""
    },

    mpesaAccountName: {
        type: String,
        default: ""
    },

    referralBonusPct: {
        type: Number,
        default: 10
    },

    maintenanceMode: {
        type: Boolean,
        default: false
    },

    maintenanceMessage: {
        type: String,
        default: "We are currently undergoing maintenance. Please check back soon."
    },

    siteName: {
        type: String,
        default: "My Platform"
    },

    supportPhone: {
        type: String,
        default: ""
    },

    supportEmail: {
        type: String,
        default: ""
    },

    announcementBanner: {
        type: String,
        default: ""
    }

}, { timestamps: true });

module.exports = mongoose.model("Settings", settingsSchema);