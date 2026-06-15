require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const passport = require("passport");
const session = require("express-session");
const flash = require("connect-flash");
const User = require("./models/User");
const homeRoutes = require('./routes/home');

const authRoutes = require('./routes/auth');
const depositRoutes = require('./routes/deposit');
const adminRoutes = require('./routes/admin');
const sharesRouter = require('./routes/shares');
const packagesRoutes = require('./routes/packages');
const withdrawRoutes = require('./routes/withdraw');
const adminWithdrawalsRoutes = require('./routes/adminWithdrawals');
const freelancersRoutes = require('./routes/freelancers');
const tasksRoutes = require('./routes/tasks');
const transactionsRoutes = require('./routes/transactions');
const teamRoutes = require('./routes/team');
const profileRoutes = require('./routes/profile');

const app = express();

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "vaultj_secret_key",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    res.locals.user = req.user || null;
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    next();
});

mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("Connected to MongoDB!"))
.catch(err => console.log("MongoDB connection error:", err));

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use("/", authRoutes);
app.get("/", (req, res) => res.render("landing"));
app.use("/", homeRoutes);
app.use("/", depositRoutes);
app.use("/", adminRoutes);
app.use('/shares', sharesRouter);
app.use("/", packagesRoutes);
app.use("/", withdrawRoutes);
app.use("/", adminWithdrawalsRoutes);
app.use("/", freelancersRoutes);
app.use("/", tasksRoutes);
app.use("/", transactionsRoutes);
app.use("/", teamRoutes);
app.use("/", profileRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));