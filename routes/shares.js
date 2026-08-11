const express = require("express");
const router = express.Router();
const User = require("../models/User");
const SaccoMember = require("../models/SaccoMember");
const SaccoSettings = require("../models/SaccoSettings");
const Transaction = require("../models/Transaction");
const Loan = require("../models/Loan");
const GuarantorRequest = require("../models/GuarantorRequest");

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

    await Transaction.create({
      user: user._id,
      member: member._id,
      type: "registration_fee",
      amount: fee,
      method: "manual",
      status: "completed",
      balanceAfter: user.walletBalance,
      description: "SACCO registration fee"
    });

    req.flash("success", "Registration successful! Welcome to Fintech Smart SACCO — you're now a fully registered member.");
    res.redirect("/shares");
  } catch (err) {
    console.error(err);
    req.flash("error", "Registration failed. Please try again.");
    res.redirect("/shares");
  }
});

// GET /shares/dashboard — full member dashboard
router.get("/dashboard", ensureAuthenticated, async (req, res) => {
  try {
    const member = await SaccoMember.findOne({ user: req.user._id });

    if (!member || member.status !== "approved") {
      req.flash("error", "You need to complete SACCO registration first.");
      return res.redirect("/shares");
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [recentTransactions, activeLoan, pendingGuarantorRequests, growthRaw] = await Promise.all([
      Transaction.find({ member: member._id, status: "completed" })
        .sort({ createdAt: -1 })
        .limit(10),

      Loan.findOne({ member: member._id, status: { $in: ["active", "pending"] } }).sort({ createdAt: -1 }),

      GuarantorRequest.find({ guarantor: req.user._id, status: "pending" })
        .populate({ path: "loan", populate: { path: "member", select: "fullName" } }),

      Transaction.aggregate([
        {
          $match: {
            member: member._id,
            status: "completed",
            type: { $in: ["deposit", "withdrawal", "shares"] },
            createdAt: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
            total: {
              $sum: {
                $cond: [{ $eq: ["$type", "withdrawal"] }, { $multiply: ["$amount", -1] }, "$amount"]
              }
            }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ])
    ]);

    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const growthLabels = growthRaw.map(g => `${monthNames[g._id.month - 1]} ${g._id.year}`);
    const growthValues = growthRaw.map(g => g.total);

    const totalSavings = member.availableSavings + member.lockedSavings;

    res.render("shares-dashboard", {
      member,
      totalSavings,
      recentTransactions,
      activeLoan,
      pendingGuarantorRequests,
      growthLabels: JSON.stringify(growthLabels),
      growthValues: JSON.stringify(growthValues)
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Could not load dashboard.");
    res.redirect("/shares");
  }
});

// POST /shares/guarantor/:id/respond — accept or decline a guarantor request
router.post("/guarantor/:id/respond", ensureAuthenticated, async (req, res) => {
  try {
    const { decision } = req.body; // "accepted" | "declined"

    if (!["accepted", "declined"].includes(decision)) {
      req.flash("error", "Invalid response.");
      return res.redirect("/shares/dashboard");
    }

    const request = await GuarantorRequest.findOne({
      _id: req.params.id,
      guarantor: req.user._id,
      status: "pending"
    });

    if (!request) {
      req.flash("error", "Guarantor request not found or already resolved.");
      return res.redirect("/shares/dashboard");
    }

    request.status = decision;
    request.respondedAt = new Date();
    await request.save();

    req.flash("success", `Guarantor request ${decision}.`);
    res.redirect("/shares/dashboard");
  } catch (err) {
    console.error(err);
    req.flash("error", "Could not process your response.");
    res.redirect("/shares/dashboard");
  }
});

module.exports = router;