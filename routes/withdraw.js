const express     = require("express");
const router      = express.Router();
const axios       = require("axios");
const crypto      = require("crypto");
const User        = require("../models/User");
const Transaction = require("../models/Transaction");

const MIN_WITHDRAWAL = 100;

/* ── AUTH GUARD ── */
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.flash("error", "Please login first.");
    res.redirect("/login");
}

/* ── REUSE ACCESS TOKEN HELPER ── */
async function getAccessToken() {
    const auth = Buffer.from(
        `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
    ).toString("base64");

    const res = await axios.get(
        "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
        { headers: { Authorization: `Basic ${auth}` } }
    );
    return res.data.access_token;
}

/* ── GENERATE SECURITY CREDENTIAL ── */
function getSecurityCredential() {
    // In production: encrypt initiator password with Safaricom public cert
    // For sandbox you can use the pre-generated credential from Daraja portal
    return process.env.MPESA_SECURITY_CREDENTIAL;
}

/* ── WITHDRAW PAGE ── */
router.get("/withdraw", isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const recentWithdrawals = await Transaction.find({
            user:   user._id,
            type:   "withdrawal"
        })
        .sort({ createdAt: -1 })
        .limit(5);

        res.render("withdraw", { user, recentWithdrawals, MIN_WITHDRAWAL });
    } catch (err) {
        console.error("Withdraw page error:", err);
        req.flash("error", "Something went wrong.");
        res.redirect("/home");
    }
});

/* ── SUBMIT WITHDRAWAL ── */
router.post("/withdraw", isLoggedIn, async (req, res) => {
    try {
        const user   = await User.findById(req.user._id);
        const amount = Math.round(Number(req.body.amount));
        let   phone  = (req.body.phone || user.phone || "").toString().trim();

        /* ── VALIDATIONS ── */
        if (!amount || amount < MIN_WITHDRAWAL) {
            req.flash("error", `Minimum withdrawal is KES ${MIN_WITHDRAWAL}.`);
            return res.redirect("/withdraw");
        }

        if (user.walletBalance < amount) {
            req.flash("error", `Insufficient wallet balance. You have KES ${user.walletBalance}.`);
            return res.redirect("/withdraw");
        }

        // Must have an active package to withdraw
        if (!user.package || user.package === "None") {
            req.flash("error", "You need an active package to withdraw funds.");
            return res.redirect("/withdraw");
        }

        /* ── FORMAT PHONE ── */
        if (phone.startsWith("07") || phone.startsWith("01")) {
            phone = "254" + phone.slice(1);
        } else if (phone.startsWith("+254")) {
            phone = phone.slice(1);
        }

        if (!/^2547\d{8}$|^2541\d{8}$/.test(phone)) {
            req.flash("error", "Invalid M-Pesa phone number.");
            return res.redirect("/withdraw");
        }

        /* ── DEDUCT BALANCE IMMEDIATELY (hold) ── */
        user.walletBalance -= amount;
        await user.save();

        /* ── CREATE PENDING TRANSACTION ── */
        const transaction = await Transaction.create({
            user:   user._id,
            amount,
            type:   "withdrawal",
            method: "stk",
            status: "pending"
        });

        /* ── B2C REQUEST ── */
        const token = await getAccessToken();

        const b2cRes = await axios.post(
            process.env.MPESA_B2C_URL,
            {
                InitiatorName:      process.env.MPESA_INITIATOR_NAME,
                SecurityCredential: getSecurityCredential(),
                CommandID:          "BusinessPayment",
                Amount:             amount,
                PartyA:             process.env.MPESA_B2C_SHORTCODE,
                PartyB:             phone,
                Remarks:            "Wallet withdrawal",
                QueueTimeOutURL:    process.env.MPESA_B2C_TIMEOUT_URL,
                ResultURL:          process.env.MPESA_B2C_RESULT_URL,
                Occasion:           `TXN-${transaction._id}`
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        console.log("B2C response:", b2cRes.data);

        // Store the ConversationID to match the result callback
        transaction.checkoutRequestID = b2cRes.data.ConversationID;
        await transaction.save();

        req.flash("success", `Withdrawal of KES ${amount} submitted. You'll receive M-Pesa shortly.`);
        res.redirect("/withdraw");

    } catch (err) {
        console.error("Withdrawal error:", err.response?.data || err.message);

        // Refund the deducted amount if B2C call failed
        try {
            const user   = await User.findById(req.user._id);
            const amount = Math.round(Number(req.body.amount));
            user.walletBalance += amount;
            await user.save();

            // Mark any pending transaction for this user as failed
            await Transaction.findOneAndUpdate(
                { user: req.user._id, type: "withdrawal", status: "pending" },
                { status: "failed" },
                { sort: { createdAt: -1 } }
            );
        } catch (refundErr) {
            console.error("Refund error:", refundErr.message);
        }

        req.flash("error", "Withdrawal failed. Your balance has been restored. Try again.");
        res.redirect("/withdraw");
    }
});

/* ── B2C RESULT CALLBACK (Safaricom calls this) ── */
router.post("/withdraw/result", async (req, res) => {
    try {
        const result         = req.body.Result;
        const resultCode     = result.ResultCode;
        const conversationID = result.ConversationID;

        const transaction = await Transaction.findOne({ checkoutRequestID: conversationID });
        if (!transaction) return res.json({ ResultCode: 0, ResultDesc: "OK" });

        if (resultCode === 0) {
            // Success
            const params          = result.ResultParameters.ResultParameter;
            const receiptParam    = params.find(p => p.Key === "TransactionReceipt");
            transaction.status    = "completed";
            transaction.code      = receiptParam?.Value || null;
            await transaction.save();

            console.log(`Withdrawal ${transaction._id} completed. Receipt: ${transaction.code}`);

        } else {
            // Failed — refund user
            transaction.status = "failed";
            await transaction.save();

            const user = await User.findById(transaction.user);
            if (user) {
                user.walletBalance += transaction.amount;
                await user.save();
                console.log(`Withdrawal ${transaction._id} failed. Refunded KES ${transaction.amount} to ${user.username}`);
            }
        }

        res.json({ ResultCode: 0, ResultDesc: "OK" });

    } catch (err) {
        console.error("B2C result callback error:", err.message);
        res.json({ ResultCode: 0, ResultDesc: "OK" });
    }
});

/* ── B2C TIMEOUT CALLBACK ── */
router.post("/withdraw/timeout", async (req, res) => {
    try {
        const conversationID = req.body.Body?.stkCallback?.ConversationID
                            || req.body.ConversationID;

        if (conversationID) {
            const transaction = await Transaction.findOne({ checkoutRequestID: conversationID });
            if (transaction && transaction.status === "pending") {
                transaction.status = "failed";
                await transaction.save();

                const user = await User.findById(transaction.user);
                if (user) {
                    user.walletBalance += transaction.amount;
                    await user.save();
                    console.log(`Timeout refund: KES ${transaction.amount} to ${user.username}`);
                }
            }
        }
    } catch (err) {
        console.error("Timeout callback error:", err.message);
    }
    res.json({ ResultCode: 0, ResultDesc: "OK" });
});

module.exports = router;