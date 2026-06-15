const express     = require("express");
const router      = express.Router();
const User        = require("../models/User");
const Transaction = require("../models/Transaction");
const Task = require("../models/Task");
const Settings = require("../models/Settings");

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

const PACKAGES = {
  Starter: { cost: 50,  referralPct: 10 },
  Bronze:  { cost: 100, referralPct: 20 },
  Silver:  { cost: 200, referralPct: 35 },
  Gold:    { cost: 500, referralPct: 50 }
};

router.get("/admin/packages", isAdmin, async (req, res) => {
  try {
    const totalUsers    = await User.countDocuments();
    const activeUsers   = await User.countDocuments({ package: { $ne: "None" } });
    const inactiveUsers = totalUsers - activeUsers;

    const packageStats = {};
    for (const name of Object.keys(PACKAGES)) {
      packageStats[name] = await User.countDocuments({ package: name });
    }

    const recentPackageUsers = await User.find({ package: { $nin: ["None", null] } })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("username email package walletBalance createdAt");

    res.render("admin/packages", {
      packages: PACKAGES,
      packageStats,
      recentPackageUsers,
      stats: { totalUsers, activeUsers, inactiveUsers }
    });

  } catch (err) {
    console.error("Admin packages error:", err);
    req.flash("error", "Failed to load packages page.");
    res.redirect("/admin");
  }
});

router.post("/admin/packages/update", isAdmin, async (req, res) => {
  try {
    const { packageName, cost, referralPct } = req.body;

    if (!PACKAGES[packageName]) {
      req.flash("error", "Invalid package name.");
      return res.redirect("/admin/packages");
    }

    PACKAGES[packageName].cost        = Number(cost);
    PACKAGES[packageName].referralPct = Number(referralPct);

    req.flash("success", `${packageName} updated — Cost: KES ${cost}, Referral: ${referralPct}%.`);
    res.redirect("/admin/packages");

  } catch (err) {
    console.error("Update package error:", err);
    req.flash("error", "Failed to update package.");
    res.redirect("/admin/packages");
  }
});

router.get("/admin/packages/users/:packageName", isAdmin, async (req, res) => {
  try {
    const { packageName } = req.params;
    const users = await User.find({ package: packageName })
      .sort({ createdAt: -1 })
      .select("username email walletBalance depositBalance createdAt");

    res.render("admin/package-users", { users, packageName });

  } catch (err) {
    console.error("Package users error:", err);
    req.flash("error", "Failed to load users.");
    res.redirect("/admin/packages");
  }
});



/* ── ADMIN TASKS PAGE ── */
router.get("/admin/tasks", isAdmin, async (req, res) => {
    try {
        const filter = req.query.filter || "all";
        const search = req.query.search || "";

        let query = {};
        if (filter === "open")   query.status = "open";
        if (filter === "closed") query.status = "closed";
        if (search) {
            query.taskName = { $regex: search, $options: "i" };
        }

        const tasks = await Task.find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .populate("postedBy", "username email");

        // Summary stats
        const totalTasks    = await Task.countDocuments();
        const openTasks     = await Task.countDocuments({ status: "open" });
        const closedTasks   = await Task.countDocuments({ status: "closed" });
        const pendingSubs   = await Task.aggregate([
            { $unwind: "$submissions" },
            { $match: { "submissions.status": "pending" } },
            { $count: "total" }
        ]);
        const approvedSubs  = await Task.aggregate([
            { $unwind: "$submissions" },
            { $match: { "submissions.status": "approved" } },
            { $count: "total" }
        ]);

        res.render("admin/tasks", {
            tasks,
            filter,
            search,
            stats: {
                totalTasks,
                openTasks,
                closedTasks,
                pendingSubmissions:  pendingSubs[0]?.total  || 0,
                approvedSubmissions: approvedSubs[0]?.total || 0
            }
        });

    } catch (err) {
        console.error("Admin tasks error:", err);
        req.flash("error", "Failed to load tasks.");
        res.redirect("/admin");
    }
});

/* ── ADMIN: VIEW SINGLE TASK SUBMISSIONS ── */
router.get("/admin/tasks/:taskId", isAdmin, async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId)
            .populate("postedBy", "username email")
            .populate("submissions.submittedBy", "username email")
            .populate("reservations.user", "username email");

        if (!task) {
            req.flash("error", "Task not found.");
            return res.redirect("/admin/tasks");
        }

        res.render("admin/task-detail", { task });

    } catch (err) {
        console.error("Task detail error:", err);
        req.flash("error", "Failed to load task.");
        res.redirect("/admin/tasks");
    }
});

/* ── APPROVE SUBMISSION ── */
router.post("/admin/tasks/:taskId/submissions/:subId/approve", isAdmin, async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId)
            .populate("submissions.submittedBy");

        if (!task) {
            req.flash("error", "Task not found.");
            return res.redirect("/admin/tasks");
        }

        const sub = task.submissions.id(req.params.subId);
        if (!sub || sub.status !== "pending") {
            req.flash("error", "Submission not found or already processed.");
            return res.redirect(`/admin/tasks/${req.params.taskId}`);
        }

        sub.status = "approved";
        task.approvedCount = (task.approvedCount || 0) + 1;

        // Pay worker from escrow
        const worker = await User.findById(sub.submittedBy._id || sub.submittedBy);
        if (worker) {
            worker.walletBalance += task.payPerTask;
            await worker.save();

            // Deduct from task escrow
            task.escrowAmount = Math.max(0, (task.escrowAmount || 0) - task.payPerTask);
        }

        // Auto-close if all workers filled
        if (task.approvedCount >= task.numWorkers) {
            task.status = "closed";
        }

        await task.save();

        req.flash("success", `Submission approved. KES ${task.payPerTask} paid to worker.`);
        res.redirect(`/admin/tasks/${req.params.taskId}`);

    } catch (err) {
        console.error("Approve submission error:", err);
        req.flash("error", "Failed to approve submission.");
        res.redirect(`/admin/tasks/${req.params.taskId}`);
    }
});

/* ── REJECT SUBMISSION ── */
router.post("/admin/tasks/:taskId/submissions/:subId/reject", isAdmin, async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId);

        if (!task) {
            req.flash("error", "Task not found.");
            return res.redirect("/admin/tasks");
        }

        const sub = task.submissions.id(req.params.subId);
        if (!sub || sub.status !== "pending") {
            req.flash("error", "Submission not found or already processed.");
            return res.redirect(`/admin/tasks/${req.params.taskId}`);
        }

        sub.status = "rejected";
        await task.save();

        req.flash("success", "Submission rejected.");
        res.redirect(`/admin/tasks/${req.params.taskId}`);

    } catch (err) {
        console.error("Reject submission error:", err);
        req.flash("error", "Failed to reject submission.");
        res.redirect(`/admin/tasks/${req.params.taskId}`);
    }
});

/* ── CLOSE / REOPEN TASK ── */
router.post("/admin/tasks/:taskId/toggle-status", isAdmin, async (req, res) => {
    try {
        const task = await Task.findById(req.params.taskId);
        if (!task) {
            req.flash("error", "Task not found.");
            return res.redirect("/admin/tasks");
        }

        task.status = task.status === "open" ? "closed" : "open";
        await task.save();

        req.flash("success", `Task marked as ${task.status}.`);
        res.redirect(`/admin/tasks/${req.params.taskId}`);

    } catch (err) {
        console.error("Toggle task status error:", err);
        req.flash("error", "Failed to update task status.");
        res.redirect("/admin/tasks");
    }
});

/* ── ADMIN USERS PAGE ── */
router.get("/admin/users", isAdmin, async (req, res) => {
    try {
        const filter = req.query.filter || "all";
        const search = req.query.search || "";
        const page   = parseInt(req.query.page) || 1;
        const limit  = 20;
        const skip   = (page - 1) * limit;

        let query = {};
        if (filter === "active")   query.package = { $ne: "None" };
        if (filter === "inactive") query.package = "None";
        if (filter === "admin")    query.isAdmin = true;
        if (filter === "starter")  query.package = "Starter";
        if (filter === "bronze")   query.package = "Bronze";
        if (filter === "silver")   query.package = "Silver";
        if (filter === "gold")     query.package = "Gold";

        if (search) {
            query.$or = [
                { username: { $regex: search, $options: "i" } },
                { email:    { $regex: search, $options: "i" } },
                { phone:    { $regex: search, $options: "i" } }
            ];
        }

        const totalCount = await User.countDocuments(query);
        const users      = await User.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select("username email phone country package walletBalance depositBalance referralEarnings tasksBalance isAdmin createdAt");

        const totalPages = Math.ceil(totalCount / limit);

        // Summary stats
        const totalUsers    = await User.countDocuments();
        const activeUsers   = await User.countDocuments({ package: { $ne: "None" } });
        const inactiveUsers = totalUsers - activeUsers;
        const adminUsers    = await User.countDocuments({ isAdmin: true });

        const balanceTotals = await User.aggregate([
            { $group: {
                _id: null,
                wallet:   { $sum: "$walletBalance" },
                deposit:  { $sum: "$depositBalance" },
                referral: { $sum: "$referralEarnings" },
                tasks:    { $sum: "$tasksBalance" }
            }}
        ]);

        res.render("admin/users", {
            users,
            filter,
            search,
            page,
            totalPages,
            totalCount,
            stats: {
                totalUsers,
                activeUsers,
                inactiveUsers,
                adminUsers,
                totalWallet:   balanceTotals[0]?.wallet   || 0,
                totalDeposit:  balanceTotals[0]?.deposit  || 0,
                totalReferral: balanceTotals[0]?.referral || 0,
                totalTasks:    balanceTotals[0]?.tasks    || 0
            }
        });

    } catch (err) {
        console.error("Admin users error:", err);
        req.flash("error", "Failed to load users.");
        res.redirect("/admin");
    }
});

/* ── VIEW SINGLE USER ── */
router.get("/admin/users/:userId", isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .populate("referrer", "username email");

        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/admin/users");
        }

        // Referrals this user made
        const referrals = await User.find({ referrer: user._id })
            .select("username email package createdAt")
            .sort({ createdAt: -1 });

        // Recent transactions
        const transactions = await Transaction.find({ user: user._id })
            .sort({ createdAt: -1 })
            .limit(15);

        res.render("admin/user-detail", { user, referrals, transactions });

    } catch (err) {
        console.error("User detail error:", err);
        req.flash("error", "Failed to load user.");
        res.redirect("/admin/users");
    }
});

/* ── EDIT USER BALANCES / FIELDS ── */
router.post("/admin/users/:userId/edit", isAdmin, async (req, res) => {
    try {
        const { walletBalance, depositBalance, referralEarnings, tasksBalance, package: pkg, isAdmin: adminFlag, phone, email } = req.body;

        const user = await User.findById(req.params.userId);
        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/admin/users");
        }

        if (email)            user.email            = email.trim();
        if (phone)            user.phone            = phone.trim();
        if (pkg !== undefined) user.package          = pkg;
        if (walletBalance   !== undefined) user.walletBalance   = Number(walletBalance);
        if (depositBalance  !== undefined) user.depositBalance  = Number(depositBalance);
        if (referralEarnings !== undefined) user.referralEarnings = Number(referralEarnings);
        if (tasksBalance    !== undefined) user.tasksBalance    = Number(tasksBalance);

        // Toggle admin — prevent self-demotion
        if (adminFlag !== undefined) {
            user.isAdmin = adminFlag === "true";
        }

        await user.save();

        req.flash("success", `User ${user.username} updated successfully.`);
        res.redirect(`/admin/users/${req.params.userId}`);

    } catch (err) {
        console.error("Edit user error:", err);
        req.flash("error", "Failed to update user.");
        res.redirect(`/admin/users/${req.params.userId}`);
    }
});

/* ── CREDIT / DEBIT WALLET ── */
router.post("/admin/users/:userId/adjust-balance", isAdmin, async (req, res) => {
    try {
        const { balanceType, action, amount, note } = req.body;
        const amt = Number(amount);

        if (!amt || amt <= 0) {
            req.flash("error", "Enter a valid amount.");
            return res.redirect(`/admin/users/${req.params.userId}`);
        }

        const user = await User.findById(req.params.userId);
        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/admin/users");
        }

        const field = balanceType; // walletBalance | depositBalance | referralEarnings | tasksBalance
        if (!["walletBalance", "depositBalance", "referralEarnings", "tasksBalance"].includes(field)) {
            req.flash("error", "Invalid balance type.");
            return res.redirect(`/admin/users/${req.params.userId}`);
        }

        if (action === "credit") {
            user[field] += amt;
        } else if (action === "debit") {
            if (user[field] < amt) {
                req.flash("error", "Insufficient balance to debit.");
                return res.redirect(`/admin/users/${req.params.userId}`);
            }
            user[field] -= amt;
        }

        await user.save();

        // Log as a transaction for audit trail
        await Transaction.create({
            user:        user._id,
            type:        action === "credit" ? "deposit" : "withdrawal",
            amount:      amt,
            status:      "completed",
            method:      "manual",
            description: `Admin ${action} on ${field}${note ? ": " + note : ""}`
        });

        req.flash("success", `KES ${amt} ${action}ed on ${field.replace("Balance", " balance")} for ${user.username}.`);
        res.redirect(`/admin/users/${req.params.userId}`);

    } catch (err) {
        console.error("Adjust balance error:", err);
        req.flash("error", "Failed to adjust balance.");
        res.redirect(`/admin/users/${req.params.userId}`);
    }
});

/* ── DELETE USER ── */
router.post("/admin/users/:userId/delete", isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/admin/users");
        }

        if (user.isAdmin) {
            req.flash("error", "Cannot delete an admin account.");
            return res.redirect(`/admin/users/${req.params.userId}`);
        }

        await Transaction.deleteMany({ user: user._id });
        await User.findByIdAndDelete(req.params.userId);

        req.flash("success", `User ${user.username} and their transactions have been deleted.`);
        res.redirect("/admin/users");

    } catch (err) {
        console.error("Delete user error:", err);
        req.flash("error", "Failed to delete user.");
        res.redirect("/admin/users");
    }
});

/* ── TOGGLE ADMIN FLAG ── */
router.post("/admin/users/:userId/toggle-admin", isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/admin/users");
        }

        // Prevent removing own admin rights
        if (user._id.toString() === req.user._id.toString()) {
            req.flash("error", "You cannot change your own admin status.");
            return res.redirect(`/admin/users/${req.params.userId}`);
        }

        user.isAdmin = !user.isAdmin;
        await user.save();

        req.flash("success", `${user.username} is now ${user.isAdmin ? "an admin" : "a regular user"}.`);
        res.redirect(`/admin/users/${req.params.userId}`);

    } catch (err) {
        console.error("Toggle admin error:", err);
        req.flash("error", "Failed to update admin status.");
        res.redirect(`/admin/users/${req.params.userId}`);
    }
});

/* ── ADMIN REFERRALS PAGE ── */
router.get("/admin/referrals", isAdmin, async (req, res) => {
    try {
        const search = req.query.search || "";
        const page   = parseInt(req.query.page) || 1;
        const limit  = 20;
        const skip   = (page - 1) * limit;

        // Find users who have at least one referral
        let referrerQuery = {};
        if (search) {
            referrerQuery.$or = [
                { username: { $regex: search, $options: "i" } },
                { email:    { $regex: search, $options: "i" } }
            ];
        }

        // Aggregate referral counts per referrer
        const referralCounts = await User.aggregate([
            { $match: { referrer: { $ne: null } } },
            { $group: { _id: "$referrer", count: { $sum: 1 }, totalEarningsGenerated: { $sum: "$walletBalance" } } }
        ]);

        const referrerIds = referralCounts.map(r => r._id);
        referrerQuery._id = { $in: referrerIds };

        const totalCount = await User.countDocuments(referrerQuery);

        const referrers = await User.find(referrerQuery)
            .select("username email phone package referralEarnings createdAt")
            .sort({ referralEarnings: -1 })
            .skip(skip)
            .limit(limit);

        // Attach referral count to each referrer
        const countMap = {};
        referralCounts.forEach(r => { countMap[r._id.toString()] = r.count; });

        const referrersWithCounts = referrers.map(u => ({
            ...u.toObject(),
            referralCount: countMap[u._id.toString()] || 0
        }));

        const totalPages = Math.ceil(totalCount / limit);

        // Summary stats
        const totalReferrers = referralCounts.length;
        const totalReferred  = referralCounts.reduce((sum, r) => sum + r.count, 0);

        const totalReferralEarnings = await User.aggregate([
            { $group: { _id: null, total: { $sum: "$referralEarnings" } } }
        ]);

        res.render("admin/referrals", {
            referrers: referrersWithCounts,
            search,
            page,
            totalPages,
            totalCount,
            stats: {
                totalReferrers,
                totalReferred,
                totalReferralEarnings: totalReferralEarnings[0]?.total || 0
            }
        });

    } catch (err) {
        console.error("Admin referrals error:", err);
        req.flash("error", "Failed to load referrals.");
        res.redirect("/admin");
    }
});

/* ── ADMIN: VIEW SINGLE REFERRER'S TEAM ── */
router.get("/admin/referrals/:userId", isAdmin, async (req, res) => {
    try {
        const referrer = await User.findById(req.params.userId)
            .select("username email phone package referralEarnings createdAt");

        if (!referrer) {
            req.flash("error", "User not found.");
            return res.redirect("/admin/referrals");
        }

        const referrals = await User.find({ referrer: referrer._id })
            .select("username email phone country package walletBalance referralEarnings createdAt")
            .sort({ createdAt: -1 });

        res.render("admin/referral-detail", { referrer, referrals });

    } catch (err) {
        console.error("Referral detail error:", err);
        req.flash("error", "Failed to load referral details.");
        res.redirect("/admin/referrals");
    }
});

/* ── ADMIN SETTINGS PAGE ── */
router.get("/admin/settings", isAdmin, async (req, res) => {
    try {
        let settings = await Settings.findOne({ key: "platform" });

        if (!settings) {
            settings = await Settings.create({ key: "platform" });
        }

        const admins = await User.find({ isAdmin: true })
            .select("username email phone createdAt");

        res.render("admin/settings", {
            settings,
            admins,
            currentUserId: req.user._id.toString()
        });

    } catch (err) {
        console.error("Admin settings error:", err);
        req.flash("error", "Failed to load settings.");
        res.redirect("/admin");
    }
});

/* ── UPDATE PLATFORM SETTINGS ── */
router.post("/admin/settings/update", isAdmin, async (req, res) => {
    try {
        const {
            siteName,
            minDeposit,
            minWithdrawal,
            withdrawalFeePct,
            referralBonusPct,
            depositInstructions,
            mpesaPaybill,
            mpesaAccountName,
            supportPhone,
            supportEmail,
            announcementBanner,
            maintenanceMode,
            maintenanceMessage
        } = req.body;

        let settings = await Settings.findOne({ key: "platform" });
        if (!settings) {
            settings = new Settings({ key: "platform" });
        }

        if (siteName !== undefined)            settings.siteName            = siteName.trim();
        if (minDeposit !== undefined)           settings.minDeposit          = Number(minDeposit);
        if (minWithdrawal !== undefined)        settings.minWithdrawal       = Number(minWithdrawal);
        if (withdrawalFeePct !== undefined)     settings.withdrawalFeePct    = Number(withdrawalFeePct);
        if (referralBonusPct !== undefined)     settings.referralBonusPct    = Number(referralBonusPct);
        if (depositInstructions !== undefined)  settings.depositInstructions = depositInstructions.trim();
        if (mpesaPaybill !== undefined)         settings.mpesaPaybill        = mpesaPaybill.trim();
        if (mpesaAccountName !== undefined)     settings.mpesaAccountName    = mpesaAccountName.trim();
        if (supportPhone !== undefined)         settings.supportPhone        = supportPhone.trim();
        if (supportEmail !== undefined)         settings.supportEmail        = supportEmail.trim();
        if (announcementBanner !== undefined)   settings.announcementBanner  = announcementBanner.trim();
        if (maintenanceMessage !== undefined)   settings.maintenanceMessage  = maintenanceMessage.trim();

        settings.maintenanceMode = maintenanceMode === "on" || maintenanceMode === "true";

        await settings.save();

        req.flash("success", "Platform settings updated successfully.");
        res.redirect("/admin/settings");

    } catch (err) {
        console.error("Update settings error:", err);
        req.flash("error", "Failed to update settings.");
        res.redirect("/admin/settings");
    }
});

/* ── RESET USER PASSWORD ── */
router.post("/admin/settings/reset-password", isAdmin, async (req, res) => {
    try {
        const { userIdentifier, newPassword, confirmPassword } = req.body;

        if (!userIdentifier || !newPassword) {
            req.flash("error", "Please provide a username/email and new password.");
            return res.redirect("/admin/settings");
        }

        if (newPassword.length < 6) {
            req.flash("error", "Password must be at least 6 characters.");
            return res.redirect("/admin/settings");
        }

        if (newPassword !== confirmPassword) {
            req.flash("error", "Passwords do not match.");
            return res.redirect("/admin/settings");
        }

        // Find by username OR email
        const user = await User.findOne({
            $or: [
                { username: userIdentifier.trim() },
                { email: userIdentifier.trim() }
            ]
        });

        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/admin/settings");
        }

        // passport-local-mongoose method to set new password (handles hashing)
        await user.setPassword(newPassword);
        await user.save();

        req.flash("success", `Password reset successfully for ${user.username}.`);
        res.redirect("/admin/settings");

    } catch (err) {
        console.error("Reset password error:", err);
        req.flash("error", "Failed to reset password.");
        res.redirect("/admin/settings");
    }
});

/* ── ADD NEW ADMIN ── */
router.post("/admin/settings/add-admin", isAdmin, async (req, res) => {
    try {
        const { userIdentifier } = req.body;

        if (!userIdentifier) {
            req.flash("error", "Please provide a username or email.");
            return res.redirect("/admin/settings");
        }

        const user = await User.findOne({
            $or: [
                { username: userIdentifier.trim() },
                { email: userIdentifier.trim() }
            ]
        });

        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/admin/settings");
        }

        if (user.isAdmin) {
            req.flash("error", `${user.username} is already an admin.`);
            return res.redirect("/admin/settings");
        }

        user.isAdmin = true;
        await user.save();

        req.flash("success", `${user.username} has been granted admin access.`);
        res.redirect("/admin/settings");

    } catch (err) {
        console.error("Add admin error:", err);
        req.flash("error", "Failed to add admin.");
        res.redirect("/admin/settings");
    }
});

/* ── REMOVE ADMIN ── */
router.post("/admin/settings/remove-admin/:userId", isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);

        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/admin/settings");
        }

        if (user._id.toString() === req.user._id.toString()) {
            req.flash("error", "You cannot remove your own admin status.");
            return res.redirect("/admin/settings");
        }

        user.isAdmin = false;
        await user.save();

        req.flash("success", `${user.username}'s admin access has been removed.`);
        res.redirect("/admin/settings");

    } catch (err) {
        console.error("Remove admin error:", err);
        req.flash("error", "Failed to remove admin.");
        res.redirect("/admin/settings");
    }
});

/* ── ADMIN CHANGE OWN PASSWORD ── */
router.post("/admin/settings/change-my-password", isAdmin, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            req.flash("error", "Please fill in all password fields.");
            return res.redirect("/admin/settings");
        }

        if (newPassword !== confirmPassword) {
            req.flash("error", "New passwords do not match.");
            return res.redirect("/admin/settings");
        }

        if (newPassword.length < 6) {
            req.flash("error", "Password must be at least 6 characters.");
            return res.redirect("/admin/settings");
        }

        const user = await User.findById(req.user._id);

        // authenticate() is provided by passport-local-mongoose
        const { user: authUser, error } = await new Promise((resolve) => {
            user.authenticate(currentPassword, (err, authUser, error) => {
                resolve({ user: authUser, error: err || error });
            });
        });

        if (!authUser) {
            req.flash("error", "Current password is incorrect.");
            return res.redirect("/admin/settings");
        }

        await user.setPassword(newPassword);
        await user.save();

        req.flash("success", "Your password has been updated successfully.");
        res.redirect("/admin/settings");

    } catch (err) {
        console.error("Change own password error:", err);
        req.flash("error", "Failed to change password.");
        res.redirect("/admin/settings");
    }
});

module.exports = router;