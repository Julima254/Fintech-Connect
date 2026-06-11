const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Task = require('../models/Task');
const User = require('../models/User');
const ServicePost = require('../models/ServicePost');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/services'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error', 'Please log in first.');
  res.redirect('/login');
}

// GET /tasks
router.get('/tasks', isLoggedIn, (req, res) => {
  res.render('tasks/index', { user: req.user });
});

// GET /tasks/explore
router.get('/tasks/explore', isLoggedIn, async (req, res) => {
  try {
    const tasks = await Task.find({ status: 'open' })
      .populate('postedBy', 'username')
      .sort({ createdAt: -1 });

    const userId = req.user._id.toString();

    const annotated = tasks.map(t => {
      const reservation = t.reservations && t.reservations.find(
        r => r.user.toString() === userId
      );
      return {
        task: t,
        reserved: !!reservation,
        reservedAt: reservation ? reservation.reservedAt : null,
        timeLimitMs: parseTimeLimitToMs(t.timeLimit)
      };
    });

    res.render('tasks/explore', { user: req.user, annotated });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load tasks.');
    res.redirect('/tasks');
  }
});

// POST /tasks/reserve/:taskId
router.post('/tasks/reserve/:taskId', isLoggedIn, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task || task.status !== 'open') {
      req.flash('error', 'Task not available.');
      return res.redirect('/tasks/explore');
    }

    if (!task.reservations) task.reservations = [];

    const alreadyReserved = task.reservations.find(
      r => r.user.toString() === req.user._id.toString()
    );
    if (alreadyReserved) {
      req.flash('error', 'You already reserved this task.');
      return res.redirect('/tasks/explore');
    }

    task.reservations.push({ user: req.user._id, reservedAt: new Date() });
    await task.save();

    req.flash('success', 'Task reserved! Timer has started.');
    res.redirect('/tasks/explore');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not reserve task.');
    res.redirect('/tasks/explore');
  }
});

// POST /tasks/unreserve/:taskId
router.post('/tasks/unreserve/:taskId', isLoggedIn, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      req.flash('error', 'Task not found.');
      return res.redirect('/tasks/explore');
    }

    task.reservations = (task.reservations || []).filter(
      r => r.user.toString() !== req.user._id.toString()
    );
    await task.save();

    req.flash('success', 'Reservation cancelled.');
    res.redirect('/tasks/explore');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not unreserve task.');
    res.redirect('/tasks/explore');
  }
});

// GET /tasks/post-service
router.get('/tasks/post-service', isLoggedIn, (req, res) => {
  res.render('tasks/post-service', { user: req.user, errors: [] });
});

// POST /tasks/post-service
router.post('/tasks/post-service', isLoggedIn, upload.single('serviceImage'), async (req, res) => {
  try {
    const { description, price, facebook, instagram, twitter, whatsapp, addImage } = req.body;
    const errors = [];

    if (!description || description.trim().length < 20) {
      errors.push('Please describe your services in at least 20 characters.');
    }
    if (!price || isNaN(price) || parseFloat(price) <= 0) {
      errors.push('Please enter a valid price.');
    }

    if (errors.length > 0) {
      return res.render('tasks/post-service', { user: req.user, errors });
    }

    const user = await User.findById(req.user._id);
    let imageCharged = false;
    let imagePath = null;

    if (addImage === 'yes' && req.file) {
      const IMAGE_CHARGE = 50;
      if (user.walletBalance < IMAGE_CHARGE) {
        return res.render('tasks/post-service', {
          user,
          errors: [`Insufficient balance. You need KES ${IMAGE_CHARGE} but have KES ${user.walletBalance.toFixed(2)}.`]
        });
      }
      user.walletBalance -= IMAGE_CHARGE;
      await user.save();
      imagePath = '/uploads/services/' + req.file.filename;
      imageCharged = true;
    }

    await ServicePost.create({
      postedBy: user._id,
      description: description.trim(),
      price: parseFloat(price),
      socialMedia: { facebook, instagram, twitter, whatsapp },
      image: imagePath,
      imageCharged
    });

    req.flash('success', `Service posted!${imageCharged ? ' KES 50 charged for image.' : ''}`);
    res.redirect('/tasks/my-services');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Something went wrong posting your service.');
    res.redirect('/tasks/post-service');
  }
});

// GET /tasks/my-services
router.get('/tasks/my-services', isLoggedIn, async (req, res) => {
  try {
    const services = await ServicePost.find({ postedBy: req.user._id }).sort({ createdAt: -1 });
    res.render('tasks/my-services', { user: req.user, services });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Could not load your services.');
    res.redirect('/tasks');
  }
});

function parseTimeLimitToMs(timeLimit) {
  if (!timeLimit) return 0;
  const str = timeLimit.toString().toLowerCase().trim();
  const num = parseFloat(str);
  if (str.includes('hour')) return num * 3600000;
  if (str.includes('min'))  return num * 60000;
  if (str.includes('day'))  return num * 86400000;
  return num * 3600000;
}

module.exports = router;