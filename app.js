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

//routes
const authRoutes = require('./routes/auth');
const depositRoutes = require('./routes/deposit');
const adminRoutes = require('./routes/admin');
const sharesRouter = require('./routes/shares');



const app = express();

// 1. Static & View Engine
app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));


// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || "vaultj_secret_key",
  resave: false,
  saveUninitialized: false
}));

 // Passport & Flash Initialization
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

//  Global Variables Middleware
app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    // req.flash() returns an array, EJS logic handles the display
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    next();
});

// MongoDB Connection 
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("Connected to MongoDB!"))
.catch(err => console.log("MongoDB connection error:", err));

// Passport Config
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());


// Global Variables Middleware
app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    res.locals.user = req.user || null; // Add this line
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    next();
});


//Standard Routes
app.use("/", authRoutes);
app.get("/", (req, res) => res.render("landing"));
app.use("/", homeRoutes);
app.use("/", depositRoutes);
app.use("/", adminRoutes);
app.use('/shares', sharesRouter);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));