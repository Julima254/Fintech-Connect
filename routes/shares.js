const express = require("express");
const router = express.Router();
const User = require("../models/User");
const SaccoMember = require("../models/SaccoMember");
const SaccoSettings = require("../models/SaccoSettings");

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  req.flash("error", "Please log in to continue.");
  res.redirect("/login");
}

// GET /shares — shows terms, form, or existing membership status
router.get("/", ensureAuthenticated, async (req, res) => {
  try {
    const member = await SaccoMember.findOne({ user: req.user._id });
    const settings = await SaccoSettings.getSettings();

    res.render("shares", {
      member,
      registrationFee: settings.registrationFee,
      walletBalance: req.user.walletBalance
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Something went wrong.");
    res.redirect("/");
  }
});

// POST /shares/register — validates, deducts fee, creates member record
router.post("/register", ensureAuthenticated, async (req, res) => {
  try {
    const { fullName, idNumber, phone, email, occupation, acceptedTerms } = req.body;

    if (!acceptedTerms) {
      req.flash("error", "You must accept the terms and conditions to proceed.");
      return res.redirect("/shares");
    }

    if (!fullName || !idNumber || !phone || !email || !occupation) {
      req.flash("error", "Please fill in all fields.");
      return res.redirect("/shares");
    }

    const existing = await SaccoMember.findOne({ user: req.user._id });
    if (existing) {
      req.flash("error", "You have already registered for the SACCO.");
      return res.redirect("/shares");
    }

    const settings = await SaccoSettings.getSettings();
    const fee = settings.registrationFee;

    const user = await User.findById(req.user._id);

    if (user.walletBalance < fee) {
      req.flash("error", `Insufficient wallet balance. You need KES ${fee} to register.`);
      return res.redirect("/shares");
    }

    user.walletBalance -= fee;
    await user.save();

    const member = new SaccoMember({
      user: user._id,
      fullName,
      idNumber,
      phone,
      email,
      occupation,
      termsAcceptedAt: new Date(),
      registrationFeePaid: fee,
       status: "approved"
    });

    await member.save();

    req.flash("success", "Registration successful! Welcome to Fintech Smart SACCO — you're now a fully registered member.");
res.redirect("/shares");
  } catch (err) {
    console.error(err);
    req.flash("error", "Registration failed. Please try again.");
    res.redirect("/shares");
  }
});

router.get("/dashboard", ensureAuthenticated, async (req, res) => {
  const member = await SaccoMember.findOne({ user: req.user._id });

  if (!member || member.status !== "approved") {
    req.flash("error", "You need to complete SACCO registration first.");
    return res.redirect("/shares");
  }

  res.send("SACCO Dashboard coming soon.");
});

module.exports = router;