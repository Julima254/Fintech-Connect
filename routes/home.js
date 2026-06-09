const express = require("express");
const router  = express.Router();
const User    = require("../models/User");
const Transaction = require("../models/Transaction");
/* ── AUTH GUARD ── */
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.flash("error", "Please login first");
    res.redirect("/login");
}

/* ── HOME PAGE ── */
router.get("/home", isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        const totalReferrals = await User.countDocuments({ referrer: req.user._id });

        const transactions = await Transaction.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(10);

        res.render("home", {
            user,
            totalReferrals,
            transactions
        });

    } catch (err) {
        console.error(err);
        req.flash("error", "Something went wrong.");
        res.redirect("/login");
    }
});

/* ── WALLET BALANCE API (polled every 10s by home.ejs) ── */
router.get("/user/wallet", isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({
            success:       true,
            walletBalance: user.walletBalance  || 0,
            tasksBalance:  user.tasksBalance   || 0
        });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

module.exports = router;