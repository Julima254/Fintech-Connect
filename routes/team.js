const express = require('express');
const router = express.Router();
const User = require('../models/User');

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.flash('error', 'Please log in to view your team.');
    res.redirect('/login');
}

router.get('/team', isLoggedIn, async (req, res) => {
    try {
        const referrals = await User.find({ referrer: req.user._id })
            .select('username email phone country package walletBalance referralEarnings createdAt')
            .sort({ createdAt: -1 });

        res.render('team', {
            referrals,
            currentUser: req.user
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Could not load your team.');
        res.redirect('/dashboard');
    }
});

module.exports = router;