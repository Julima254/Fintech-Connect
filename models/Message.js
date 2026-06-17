const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    username: {
        type: String,
        required: true
    },
    text: {
        type: String,
        default: ""
    },
    image: {
        type: String, // base64 data URI, kept small via upload size limit
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 86400 // auto-delete after 24 hours
    }
});

module.exports = mongoose.model("Message", messageSchema);