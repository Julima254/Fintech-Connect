const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const User = require("../models/User");

/* ── ADMIN GUARD ── */
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.isAdmin) return next();
    req.flash("error", "Access denied.");
    res.redirect("/login");
}

/* ── LIST ALL WITHDRAWALS ── */
router.get("/admin/withdrawals", isAdmin, async (req, res) => {
    try {
        const { status, search, page = 1 } = req.query;
        const limit = 15;
        const skip  = (page - 1) * limit;

        const filter = { type: "withdrawal" };
        if (status && status !== "all") filter.status = status;

        // Build query with optional user search
        let transactions;
        let total;

        if (search) {
            // Find users matching search (username or phone)
            const users = await User.find({
                $or: [
                    { username: { $regex: search, $options: "i" } },
                    { phone:    { $regex: search, $options: "i" } }
                ]
            }).select("_id");

            const userIds = users.map(u => u._id);
            filter.user   = { $in: userIds };
        }

        total        = await Transaction.countDocuments(filter);
        transactions = await Transaction.find(filter)
            .populate("user", "username email phone walletBalance")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Summary stats (all time, ignoring status filter)
        const [stats] = await Transaction.aggregate([
            { $match: { type: "withdrawal" } },
            {
                $group: {
                    _id:       null,
                    total:     { $sum: "$amount" },
                    completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$amount", 0] } },
                    pending:   { $sum: { $cond: [{ $eq: ["$status", "pending"]   }, "$amount", 0] } },
                    failed:    { $sum: { $cond: [{ $eq: ["$status", "failed"]    }, "$amount", 0] } },
                    countAll:  { $sum: 1 },
                    countPending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } }
                }
            }
        ]);

        res.render("admin/withdrawals", {
            transactions,
            stats: stats || { total: 0, completed: 0, pending: 0, failed: 0, countAll: 0, countPending: 0 },
            currentPage: Number(page),
            totalPages:  Math.ceil(total / limit),
            total,
            status:      status || "all",
            search:      search || ""
        });

    } catch (err) {
        console.error("Admin withdrawals error:", err);
        req.flash("error", "Failed to load withdrawals.");
        res.redirect("/admin");
    }
});

/* ── APPROVE / MARK COMPLETE (manual override) ── */
router.post("/admin/withdrawals/:id/approve", isAdmin, async (req, res) => {
    try {
        const txn = await Transaction.findById(req.params.id);
        if (!txn) { req.flash("error", "Transaction not found."); return res.redirect("/admin/withdrawals"); }

        txn.status = "completed";
        txn.code   = req.body.receiptCode || "MANUAL";
        await txn.save();

        req.flash("success", `Withdrawal ${txn._id} marked as completed.`);
        res.redirect("/admin/withdrawals");
    } catch (err) {
        console.error(err);
        req.flash("error", "Action failed.");
        res.redirect("/admin/withdrawals");
    }
});

/* ── REJECT & REFUND ── */
router.post("/admin/withdrawals/:id/reject", isAdmin, async (req, res) => {
    try {
        const txn = await Transaction.findById(req.params.id).populate("user");
        if (!txn) { req.flash("error", "Transaction not found."); return res.redirect("/admin/withdrawals"); }

        if (txn.status !== "completed") {
            // Refund only if not already paid out
            const user = await User.findById(txn.user._id);
            if (user) {
                user.walletBalance += txn.amount;
                await user.save();
            }
        }

        txn.status = "failed";
        await txn.save();

        req.flash("success", `Withdrawal rejected and KES ${txn.amount} refunded.`);
        res.redirect("/admin/withdrawals");
    } catch (err) {
        console.error(err);
        req.flash("error", "Action failed.");
        res.redirect("/admin/withdrawals");
    }
});

module.exports = router;