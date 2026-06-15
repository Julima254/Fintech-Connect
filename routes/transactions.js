const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.flash("error", "You must be logged in to view transactions.");
    res.redirect("/login");
}

// GET /transactions
router.get("/transactions", isLoggedIn, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const filter = { user: req.user._id };

        if (req.query.type && req.query.type !== "all") filter.type = req.query.type;
        if (req.query.status && req.query.status !== "all") filter.status = req.query.status;

        if (req.query.from || req.query.to) {
            filter.createdAt = {};
            if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
            if (req.query.to) {
                const toDate = new Date(req.query.to);
                toDate.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = toDate;
            }
        }

        const totalTransactions = await Transaction.countDocuments(filter);
        const totalPages = Math.ceil(totalTransactions / limit);

        const transactions = await Transaction.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const allUserTx = await Transaction.find({ user: req.user._id }).lean();

        const summary = {
            totalDeposited: allUserTx
                .filter(t => t.type === "deposit" && t.status === "completed")
                .reduce((sum, t) => sum + t.amount, 0),
            totalWithdrawn: allUserTx
                .filter(t => t.type === "withdrawal" && t.status === "completed")
                .reduce((sum, t) => sum + t.amount, 0),
            totalEarned: allUserTx
                .filter(t => ["referral", "task", "shares"].includes(t.type) && t.status === "completed")
                .reduce((sum, t) => sum + t.amount, 0),
            pendingCount: allUserTx.filter(t => t.status === "pending").length,
        };

        res.render("transactions/index", {
            transactions, summary, currentPage: page,
            totalPages, totalTransactions, query: req.query,
        });
    } catch (err) {
        console.error(err);
        req.flash("error", "Could not load transactions.");
        res.redirect("/dashboard");
    }
});

// GET /transactions/:id
router.get("/transactions/:id", isLoggedIn, async (req, res) => {
    try {
        const transaction = await Transaction.findOne({
            _id: req.params.id,
            user: req.user._id,
        }).lean();

        if (!transaction) {
            req.flash("error", "Transaction not found.");
            return res.redirect("/transactions");
        }

        res.render("transactions/show", { transaction });
    } catch (err) {
        console.error(err);
        req.flash("error", "Could not load transaction.");
        res.redirect("/transactions");
    }
});

module.exports = router;