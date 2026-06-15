const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Middleware to ensure user is authenticated
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.flash('error', 'You must be logged in to access that page.');
    res.redirect('/login');
}

// GET /profile
router.get('/profile', isLoggedIn, (req, res) => {
    res.render('profile', { user: req.user });
});

// POST /profile/update-details
router.post('/profile/update-details', isLoggedIn, async (req, res) => {
    try {
        const { email, phone, country, whatsappNumber } = req.body;

        if (!email || !phone || !country) {
            req.flash('error', 'Email, phone, and country are required.');
            return res.redirect('/profile');
        }

        const existingUser = await User.findOne({ email, _id: { $ne: req.user._id } });
        if (existingUser) {
            req.flash('error', 'That email is already in use by another account.');
            return res.redirect('/profile');
        }

        await User.findByIdAndUpdate(req.user._id, {
            email,
            phone,
            country,
            whatsappNumber: whatsappNumber || ''
        });

        req.flash('success', 'Profile details updated successfully.');
        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        req.flash('error', 'Something went wrong. Please try again.');
        res.redirect('/profile');
    }
});

// POST /profile/change-password
router.post('/profile/change-password', isLoggedIn, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            req.flash('error', 'All password fields are required.');
            return res.redirect('/profile');
        }

        if (newPassword.length < 6) {
            req.flash('error', 'New password must be at least 6 characters.');
            return res.redirect('/profile');
        }

        if (newPassword !== confirmPassword) {
            req.flash('error', 'New passwords do not match.');
            return res.redirect('/profile');
        }

        const user = await User.findById(req.user._id);

        user.authenticate(currentPassword, async (err, result) => {
            if (err || !result) {
                req.flash('error', 'Current password is incorrect.');
                return res.redirect('/profile');
            }

            await user.setPassword(newPassword);
            await user.save();

            req.flash('success', 'Password changed successfully. Please log in again.');
            req.logout((err) => {
                if (err) console.error(err);
                res.redirect('/login');
            });
        });
    } catch (err) {
        console.error(err);
        req.flash('error', 'Something went wrong. Please try again.');
        res.redirect('/profile');
    }
});

module.exports = router;