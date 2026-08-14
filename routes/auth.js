const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { redirectIfAuth, requireAuth } = require('../middleware/auth');

// GET /login
router.get('/login', redirectIfAuth, (req, res) => {
  res.render('auth/login', {
    title: 'Admin Login | Department of Mines & Geology Rajasthan',
    error: req.query.error || null,
    success: req.query.success || null
  });
});

// POST /login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.render('auth/login', {
        title: 'Admin Login | Department of Mines & Geology Rajasthan',
        error: 'Please provide both username and password.',
        success: null
      });
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      return res.render('auth/login', {
        title: 'Admin Login | Department of Mines & Geology Rajasthan',
        error: 'Invalid username or password.',
        success: null
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render('auth/login', {
        title: 'Admin Login | Department of Mines & Geology Rajasthan',
        error: 'Invalid username or password.',
        success: null
      });
    }

    // Set session
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.name = user.name;
    req.session.role = user.role;

    const returnTo = req.session.returnTo || '/admin/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error('Login error:', err);
    res.render('auth/login', {
      title: 'Admin Login | Department of Mines & Geology Rajasthan',
      error: 'An unexpected error occurred. Please try again.',
      success: null
    });
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login?success=' + encodeURIComponent('You have been logged out successfully.'));
  });
});

module.exports = router;
