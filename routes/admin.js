const express     = require("express");
const router      = express.Router();
const User        = require("../models/User");
const Transaction = require("../models/Transaction");

/* ── ADMIN GUARD ── */
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.isAdmin) return next();
    req.flash("error", "Access denied.");
    res.redirect("/home");
}

/* ── ADMIN DASHBOARD ── */
router.get("/admin", isAdmin, async (req, res) => {
    try {
        const now        = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        /* ── USERS ── */
        const totalUsers    = await User.countDocuments();
        const activeUsers   = await User.countDocuments({ package: { $ne: "None" } });
        const inactiveUsers = totalUsers - activeUsers;

        /* ── DEPOSITS ── */
        const depositsToday = await Transaction.aggregate([
            { $match: { type: "deposit", status: "completed", createdAt: { $gte: todayStart } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const depositsWeek = await Transaction.aggregate([
            { $match: { type: "deposit", status: "completed", createdAt: { $gte: weekStart } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const depositsMonth = await Transaction.aggregate([
            { $match: { type: "deposit", status: "completed", createdAt: { $gte: monthStart } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        /* ── WITHDRAWALS ── */
        const totalPayouts = await Transaction.aggregate([
            { $match: { type: "withdrawal", status: "completed" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const pendingWithdrawals = await Transaction.aggregate([
            { $match: { type: "withdrawal", status: "pending" } },
            { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
        ]);

        const pendingDeposits = await Transaction.aggregate([
            { $match: { type: "deposit", status: "pending", method: "manual" } },
            { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
        ]);

        /* ── USERS FUND ── */
        const usersFund = await User.aggregate([
            { $group: { _id: null, wallet: { $sum: "$walletBalance" }, deposit: { $sum: "$depositBalance" } } }
        ]);

        /* ── PLATFORM PROFIT ── */
        const totalDepositsAll = await Transaction.aggregate([
            { $match: { type: "deposit", status: "completed" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const platformProfit =
            (totalDepositsAll[0]?.total || 0) - (totalPayouts[0]?.total || 0);

        /* ── CHART DATA: last 7 days ── */
        const chartData = [];
        for (let i = 6; i >= 0; i--) {
            const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const dayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);

            const dep = await Transaction.aggregate([
                { $match: { type: "deposit", status: "completed", createdAt: { $gte: dayStart, $lt: dayEnd } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]);

            const wit = await Transaction.aggregate([
                { $match: { type: "withdrawal", status: "completed", createdAt: { $gte: dayStart, $lt: dayEnd } } },
                { $group: { _id: null, total: { $sum: "$amount" } } }
            ]);

            chartData.push({
                label:       dayStart.toLocaleDateString("en-KE", { weekday: "short", day: "numeric" }),
                deposits:    dep[0]?.total || 0,
                withdrawals: wit[0]?.total || 0
            });
        }

        /* ── RECENT TRANSACTIONS ── */
        const recentTransactions = await Transaction.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate("user", "username email");

        /* ── RECENT USERS ── */
        const recentUsers = await User.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select("username email package createdAt");

        res.render("admin/admin", {
            stats: {
                totalUsers,
                activeUsers,
                inactiveUsers,
                depositsToday:           depositsToday[0]?.total        || 0,
                depositsWeek:            depositsWeek[0]?.total         || 0,
                depositsMonth:           depositsMonth[0]?.total        || 0,
                totalPayouts:            totalPayouts[0]?.total         || 0,
                pendingWithdrawals:      pendingWithdrawals[0]?.total   || 0,
                pendingWithdrawalsCount: pendingWithdrawals[0]?.count   || 0,
                pendingDeposits:         pendingDeposits[0]?.total      || 0,
                pendingDepositsCount:    pendingDeposits[0]?.count      || 0,
                platformProfit,
                usersFund: (usersFund[0]?.wallet || 0) + (usersFund[0]?.deposit || 0)
            },
            chartData,
            recentTransactions,
            recentUsers
        });

    } catch (err) {
        console.error("Admin dashboard error:", err);
        req.flash("error", "Failed to load dashboard.");
        res.redirect("/home");
    }
});



/* ── PAYMENTS PAGE ── */
router.get("/admin/payments", isAdmin, async (req, res) => {
    try {
        const filter = req.query.filter || "all";

        let query = { type: "deposit" };
        if (filter === "pending")   query.status = "pending";
        if (filter === "completed") query.status = "completed";
        if (filter === "failed")    query.status = "failed";
        if (filter === "manual")    query.method = "manual";
        if (filter === "stk")       query.method = "stk";

        const deposits = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .populate("user", "username email phone package");

        res.render("admin/payments", { deposits, filter });

    } catch (err) {
        console.error("Payments page error:", err);
        req.flash("error", "Failed to load payments.");
        res.redirect("/admin");
    }
});

/* ── APPROVE MANUAL DEPOSIT ── */
router.post("/admin/payments/approve/:id", isAdmin, async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id).populate("user");

        if (!transaction) {
            req.flash("error", "Transaction not found.");
            return res.redirect("/admin/payments");
        }

        if (transaction.status !== "pending") {
            req.flash("error", "Transaction already processed.");
            return res.redirect("/admin/payments");
        }

        // Mark transaction completed
        transaction.status = "completed";
        await transaction.save();

        // Credit balance based on user package
        const user     = await User.findById(transaction.user._id);
        const isActive = user.package && user.package !== "None";

        if (isActive) {
            user.walletBalance += transaction.amount;
        } else {
            user.depositBalance += transaction.amount;
        }

        await user.save();

        req.flash("success", `Deposit of KES ${transaction.amount} approved for ${user.username}.`);
        res.redirect("/admin/payments");

    } catch (err) {
        console.error("Approve deposit error:", err);
        req.flash("error", "Failed to approve deposit.");
        res.redirect("/admin/payments");
    }
});

/* ── REJECT MANUAL DEPOSIT ── */
router.post("/admin/payments/reject/:id", isAdmin, async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id);

        if (!transaction) {
            req.flash("error", "Transaction not found.");
            return res.redirect("/admin/payments");
        }

        if (transaction.status !== "pending") {
            req.flash("error", "Transaction already processed.");
            return res.redirect("/admin/payments");
        }

        transaction.status = "failed";
        await transaction.save();

        req.flash("success", "Deposit rejected successfully.");
        res.redirect("/admin/payments");

    } catch (err) {
        console.error("Reject deposit error:", err);
        req.flash("error", "Failed to reject deposit.");
        res.redirect("/admin/payments");
    }
});

module.exports = router;