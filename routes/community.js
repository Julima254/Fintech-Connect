const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const Message = require("../models/Message");

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.flash("error", "Please login first");
    res.redirect("/login");
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Only image files are allowed (jpeg, png, gif, webp)."));
    }
});

function uploadImage(req, res, next) {
    upload.single("image")(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.json({ success: false, error: "Image must be smaller than 2MB." });
            }
            return res.json({ success: false, error: err.message });
        }
        next();
    });
}

/* ── COMMUNITY PAGE ── */
router.get("/community", isLoggedIn, async (req, res) => {
    try {
        const messages = await Message.find({}).sort({ createdAt: 1 }).limit(100);
        res.render("community", { messages, user: req.user });
    } catch (err) {
        console.error(err);
        req.flash("error", "Could not load community chat.");
        res.redirect("/home");
    }
});

/* ── POLLED BY community.ejs EVERY FEW SECONDS ── */
router.get("/community/messages", isLoggedIn, async (req, res) => {
    try {
        const messages = await Message.find({}).sort({ createdAt: 1 }).limit(100);
        res.json({ success: true, messages });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

/* ── SEND A MESSAGE (text and/or image) ── */
router.post("/community/message", isLoggedIn, uploadImage, async (req, res) => {
    try {
        let text = (req.body.text || "").trim();
        if (text.length > 500) text = text.slice(0, 500);

        let imageData = null;
        if (req.file) {
            imageData = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
        }

        if (!text && !imageData) {
            return res.json({ success: false, error: "Message cannot be empty." });
        }

        const message = await Message.create({
            user: req.user._id,
            username: req.user.username,
            text,
            image: imageData
        });

        res.json({ success: true, message });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Something went wrong." });
    }
});

module.exports = router;