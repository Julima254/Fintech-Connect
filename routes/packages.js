const express = require("express");
const router  = express.Router();
const User    = require("../models/User");

// Package definitions
const PACKAGES = {
  Starter: { cost: 50,  referralPct: 10  },
  Bronze:  { cost: 100, referralPct: 20  },
  Silver:  { cost: 200, referralPct: 35  },
  Gold:    { cost: 500, referralPct: 50  }
};

// Auth middleware
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash("error", "Please log in first.");
  res.redirect("/login");
}

// GET /packages
router.get("/packages", isLoggedIn, (req, res) => {
  res.render("packages", {
    packages: PACKAGES,
    currentUser: req.user
  });
});

// POST /packages/buy 
router.post("/packages/buy", isLoggedIn, async (req, res) => {
  try {
    const { packageName } = req.body;
    const pkg = PACKAGES[packageName];

    if (!pkg) {
      req.flash("error", "Invalid package selected.");
      return res.redirect("/packages");
    }

    const user = await User.findById(req.user._id);
    const isFirstTime = !user.package || user.package === "None";

    if (isFirstTime) {
      if (user.depositBalance < pkg.cost) {
        req.flash("error", `Insufficient deposit balance. You need KES ${pkg.cost} but have KES ${user.depositBalance}.`);
        return res.redirect("/packages");
      }
      const remainder = user.depositBalance - pkg.cost;
      user.walletBalance  += remainder;
      user.depositBalance  = 0;

      // Credit referrer on first-time purchase only
      if (user.referrer) {
        const referrer = await User.findById(user.referrer);
        if (referrer) {
          const bonus = pkg.cost * (pkg.referralPct / 100);
          referrer.walletBalance    += bonus;
          referrer.referralEarnings += bonus;
          await referrer.save();
        }
      }

    } else {
      if (user.walletBalance < pkg.cost) {
        req.flash("error", `Insufficient wallet balance. You need KES ${pkg.cost} but have KES ${user.walletBalance}.`);
        return res.redirect("/packages");
      }
      user.walletBalance -= pkg.cost;
    }

    user.package = packageName;
    await user.save();

    req.flash("success", `${packageName} package activated successfully!`);
    res.redirect("/packages");

  } catch (err) {
    console.error("Package purchase error:", err);
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect("/packages");
  }
});
module.exports = router;