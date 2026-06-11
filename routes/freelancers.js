const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Task = require('../models/Task');
const User = require('../models/User');
const Service = require('../models/ServicePost');
// Multer config for proof images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/proofs'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Middleware: must be logged in
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error', 'Please log in first.');
  res.redirect('/login');
}

// GET /hire-freelancers — landing (active check)
router.get('/hire-freelancers', isLoggedIn, (req, res) => {
  res.render('freelancers/index', { user: req.user });
});

// GET /hire-freelancers/post-task — show form
router.get('/hire-freelancers/post-task', isLoggedIn, (req, res) => {
  res.render('freelancers/post-task', { user: req.user, errors: [] });
});

// POST /hire-freelancers/post-task — create task
router.post('/hire-freelancers/post-task', isLoggedIn, async (req, res) => {
  try {
    const {
      taskName, timeLimit, minRequirements,
      expectedDeliverables, requiresProofImage,
      numWorkers, payPerTask
    } = req.body;

    const workers = parseInt(numWorkers);
    const pay = parseFloat(payPerTask);
    const totalCost = workers * pay;

    const user = await User.findById(req.user._id);

    if (user.walletBalance < totalCost) {
      return res.render('freelancers/post-task', {
        user,
        errors: [`Insufficient wallet balance. You need $${totalCost.toFixed(2)} but have $${user.walletBalance.toFixed(2)}.`]
      });
    }

    // Deduct from wallet
    user.walletBalance -= totalCost;
    await user.save();

    // Create task
    await Task.create({
      postedBy: user._id,
      taskName,
      timeLimit,
      minRequirements,
      expectedDeliverables,
      requiresProofImage: requiresProofImage === 'yes',
      numWorkers: workers,
      payPerTask: pay,
      totalCost,
      escrowAmount: totalCost
    });

    req.flash('success', `Task posted! $${totalCost.toFixed(2)} held in escrow.`);
    res.redirect('/hire-freelancers/my-tasks');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Something went wrong posting the task.');
    res.redirect('/hire-freelancers/post-task');
  }
});

// GET /hire-freelancers/my-tasks — poster sees their tasks + submissions
router.get('/hire-freelancers/my-tasks', isLoggedIn, async (req, res) => {
  try {
    const tasks = await Task.find({ postedBy: req.user._id })
      .populate('submissions.submittedBy', 'username');
    res.render('freelancers/my-tasks', { user: req.user, tasks });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load tasks.');
    res.redirect('/hire-freelancers');
  }
});

// POST /hire-freelancers/approve/:taskId/:submissionId — approve a submission
router.post('/hire-freelancers/approve/:taskId/:submissionId', isLoggedIn, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.taskId, postedBy: req.user._id })
      .populate('submissions.submittedBy');

    if (!task) {
      req.flash('error', 'Task not found.');
      return res.redirect('/hire-freelancers/my-tasks');
    }

    const submission = task.submissions.id(req.params.submissionId);
    if (!submission || submission.status !== 'pending') {
      req.flash('error', 'Submission not found or already processed.');
      return res.redirect('/hire-freelancers/my-tasks');
    }

    // Get the freelancer ID safely whether populated or not
    const freelancerId = submission.submittedBy?._id || submission.submittedBy;

    const PLATFORM_FEE_PERCENT = 0.10;
    const gross = task.payPerTask;
    const platformFee = parseFloat((gross * PLATFORM_FEE_PERCENT).toFixed(2));
    const freelancerPayout = parseFloat((gross - platformFee).toFixed(2));

    const freelancer = await User.findById(freelancerId);
    if (!freelancer) {
      req.flash('error', 'Could not find the freelancer account.');
      return res.redirect('/hire-freelancers/my-tasks');
    }

    freelancer.walletBalance += freelancerPayout;
    freelancer.tasksBalance  += freelancerPayout;
    await freelancer.save();

    submission.status = 'approved';
    task.approvedCount = (task.approvedCount || 0) + 1;

    // Close task if all spots filled
    if (task.approvedCount >= task.numWorkers) {
      task.status = 'closed';
    }

    await task.save();

    req.flash('success', `Approved! KES ${freelancerPayout.toFixed(2)} paid to ${freelancer.username} (KES ${platformFee.toFixed(2)} platform fee).`);
    res.redirect('/hire-freelancers/my-tasks');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Approval failed.');
    res.redirect('/hire-freelancers/my-tasks');
  }
});

// POST /hire-freelancers/reject/:taskId/:submissionId — reject a submission
router.post('/hire-freelancers/reject/:taskId/:submissionId', isLoggedIn, async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.taskId, postedBy: req.user._id });
    if (!task) {
      req.flash('error', 'Task not found.');
      return res.redirect('/hire-freelancers/my-tasks');
    }

    const submission = task.submissions.id(req.params.submissionId);
    if (!submission || submission.status !== 'pending') {
      req.flash('error', 'Submission not found or already processed.');
      return res.redirect('/hire-freelancers/my-tasks');
    }

    submission.status = 'rejected';
    await task.save();

    req.flash('success', 'Submission rejected.');
    res.redirect('/hire-freelancers/my-tasks');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Rejection failed.');
    res.redirect('/hire-freelancers/my-tasks');
  }
});



router.get('/hire-freelancers/browse', isLoggedIn, async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = { status: { $ne: 'inactive' } };

    if (category && category !== 'all') filter.category = category;
    if (search && search.trim()) {
      filter.$or = [
        { title:       { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const services = await Service.find(filter)
      .populate('postedBy', 'username')
      .sort({ createdAt: -1 });

    const allCategories = await Service.distinct('category');

    res.render('freelancers/browse', {
      user: req.user,
      services,
      allCategories,
      currentCategory: category || 'all',
      searchQuery: search || ''
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load services.');
    res.redirect('/hire-freelancers');
  }
});

module.exports = router;