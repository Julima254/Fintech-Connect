const express     = require("express");
const router      = express.Router();
const axios       = require("axios");
const User        = require("../models/User");
const Transaction = require("../models/Transaction");

/* ── AUTH GUARD ── */
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.flash("error", "Please login first");
    res.redirect("/login");
}

/* ── GENERATE ACCESS TOKEN ── */
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

/* ── GENERATE PASSWORD ── */
function generatePassword() {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-T:.Z]/g, "")
        .slice(0, 14);

    const password = Buffer.from(
        `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    return { password, timestamp };
}

/* ── DEPOSIT PAGE ── */
router.get("/deposit", isLoggedIn, (req, res) => {
    res.render("deposit", { user: req.user });
});

/* ── STK PUSH ── */
router.post("/deposit/stk", isLoggedIn, async (req, res) => {
    try {
        const { amount, phone } = req.body;

        // Format phone
        let formattedPhone = phone.toString().trim();
        if (formattedPhone.startsWith("07") || formattedPhone.startsWith("01")) {
            formattedPhone = "254" + formattedPhone.slice(1);
        } else if (formattedPhone.startsWith("+254")) {
            formattedPhone = formattedPhone.slice(1);
        }

        const token = await getAccessToken();
        const { password, timestamp } = generatePassword();

        console.log("STK Push payload:", {
            shortcode: process.env.MPESA_SHORTCODE,
            timestamp,
            amount: Math.round(Number(amount)),
            phone: formattedPhone
        });

        const stkRes = await axios.post(
            "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
            {
                BusinessShortCode: process.env.MPESA_SHORTCODE,
                Password:          password,
                Timestamp:         timestamp,
                TransactionType:   "CustomerPayBillOnline",
                Amount:            Math.round(Number(amount)),
                PartyA:            formattedPhone,
                PartyB:            process.env.MPESA_SHORTCODE,
                PhoneNumber:       formattedPhone,
                CallBackURL:       process.env.MPESA_CALLBACK_URL,
                AccountReference:  "FintechConnect",
                TransactionDesc:   "Deposit"
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        await Transaction.create({
            user:              req.user._id,
            amount:            Math.round(Number(amount)),
            method:            "stk",
            status:            "pending",
            checkoutRequestID: stkRes.data.CheckoutRequestID
        });

        res.json({
            success:           true,
            message:           "STK push sent. Enter your M-Pesa PIN.",
            checkoutRequestID: stkRes.data.CheckoutRequestID
        });

    } catch (err) {
        console.error("STK Push error full:", JSON.stringify(err.response?.data, null, 2));
        res.json({ success: false, message: "STK push failed. Please use paybill option." });
    }
});

/* ── MPESA CALLBACK (Daraja calls this) ── */
router.post("/deposit/callback", async (req, res) => {
    try {
        const body     = req.body.Body.stkCallback;
        const resultCode = body.ResultCode;
        const checkoutRequestID = body.CheckoutRequestID;

        const transaction = await Transaction.findOne({ checkoutRequestID });
        if (!transaction) return res.json({ ResultCode: 0, ResultDesc: "OK" });

        if (resultCode === 0) {
            // Payment successful
            const items  = body.CallbackMetadata.Item;
            const amount = items.find(i => i.Name === "Amount").Value;
            const code   = items.find(i => i.Name === "MpesaReceiptNumber").Value;

            transaction.status = "completed";
            transaction.code   = code;
            transaction.amount = amount;
            await transaction.save();

            // Credit user balance
            const user = await User.findById(transaction.user);
            const isActive = user.package && user.package !== "None";

            if (isActive) {
                user.walletBalance += amount;
            } else {
                user.depositBalance += amount;
            }
            await user.save();

        } else {
            transaction.status = "failed";
            await transaction.save();
        }

        res.json({ ResultCode: 0, ResultDesc: "OK" });

    } catch (err) {
        console.error("Callback error:", err.message);
        res.json({ ResultCode: 0, ResultDesc: "OK" });
    }
});

/* ── MANUAL PAYBILL CODE SUBMISSION ── */
router.post("/deposit/manual", isLoggedIn, async (req, res) => {
    try {
        const { amount, code } = req.body;

        // Check code not already used
        const exists = await Transaction.findOne({ code });
        if (exists) {
            req.flash("error", "This M-Pesa code has already been used.");
            return res.redirect("/deposit");
        }

        // Save as pending — admin will verify
        await Transaction.create({
            user:   req.user._id,
            amount: Number(amount),
            code,
            method: "manual",
            status: "pending"
        });

        req.flash("success", "Code submitted! Your balance will be updated after verification.");
        res.redirect("/home");

    } catch (err) {
        console.error("Manual deposit error:", err.message);
        req.flash("error", "Something went wrong. Try again.");
        res.redirect("/deposit");
    }
});

module.exports = router;