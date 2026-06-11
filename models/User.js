const mongoose              = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new mongoose.Schema({

    username: {
        type:     String,
        required: true,
        unique:   true
    },

    email: {
        type:     String,
        required: true,
        unique:   true
    },

    phone: {
        type:     String,
        required: true
    },

    country: {
        type:     String,
        required: true
    },

    invitationCode: {
        type: String,
        default: null
    },

    referrer: {
        type: mongoose.Schema.Types.ObjectId,
        ref:  "User"
    },

    isAdmin: {
        type:    Boolean,
        default: false
    },

    /* ── PACKAGE ── */
    package: {
        type:    String,
        default: "None"
    },

    /* ── BALANCES ── */
    walletBalance: {
        type:    Number,
        default: 0
    },

    depositBalance: {
        type:    Number,
        default: 0
    },

    referralEarnings: {
        type:    Number,
        default: 0
    },

    tasksBalance: {
        type:    Number,
        default: 0
    },

whatsappNumber: { type: String, 
                   default: '' },

    sharesBalance: {
        type:    Number,
        default: 0
    }

}, { timestamps: true });

userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);