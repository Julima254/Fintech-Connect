const express = require('express');
const passport = require("passport");
const router = express.Router();
const User = require('../models/User');

/* REGISTER PAGE */
router.get("/register", (req, res) => {
    res.render("register");
});

/* REGISTER USER */
router.post("/register", async (req, res) => {

    try {

        const {
            username,
            email,
            phone,
            country,
            invitationCode,
            password
        } = req.body;

        let referrer = null;

        if (invitationCode) {

            const inviter = await User.findOne({
                username: invitationCode
            });

            if (inviter) {
                referrer = inviter._id;
            }
        }

        const newUser = new User({
            username,
            email,
            phone,
            country,
            invitationCode: invitationCode || null,
            referrer: referrer
        });

        await User.register(newUser, password);

        req.flash("success", "Registered successfully!");

        res.redirect("/login");

    } catch (err) {

        req.flash("error", err.message);

        res.redirect("/register");
    }
});

/* LOGIN PAGE */
router.get("/login", (req, res) => {
    res.render("login");
});

/* LOGIN USER */
router.post("/login",

    passport.authenticate("local", {

        successRedirect: "/home",
        failureRedirect: "/login",
        failureFlash: true

    })

);

/* LOGOUT */
router.get("/logout", (req, res, next) => {

    req.logout(function(err) {

        if (err) {
            return next(err);
        }

        req.flash("success", "Logged out successfully.");

        res.redirect("/");
    });
});

/* LOGIN CHECK */
function isLoggedIn(req, res, next) {

    if (req.isAuthenticated()) {
        return next();
    }

    req.flash("error", "Please login first");

    res.redirect("/login");
}

/* FORGOT PASSWORD PAGE */
router.get("/forgot", (req, res) => {

    res.render("forgot");

});

module.exports = router;