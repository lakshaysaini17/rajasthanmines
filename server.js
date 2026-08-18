require('dotenv').config();
process.env.TZ = 'Asia/Kolkata';
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const compression = require('compression');
const path = require('path');

const User = require('./models/User');
const Pass = require('./models/Pass');

const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy for HTTPS cookie detection in cloud deployment (Render, Railway, Heroku, AWS)
app.set('trust proxy', 1);

// 1. Response Compression Middleware (Gzip/Brotli)
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  threshold: 1024 // Compress responses larger than 1KB
}));

// Set View Engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body Parser Middleware
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.json({ limit: '20mb' }));

// Serve Static Assets with Cache-Control headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
}));

// 2. Healthcheck & Uptime Monitoring Endpoint (/health & /ready)
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  let dbStatus = 'disconnected';
  let dbLatencyMs = null;

  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      dbStatus = 'connected';
      dbLatencyMs = Date.now() - startTime;
    }
  } catch (err) {
    dbStatus = 'error: ' + err.message;
  }

  const isHealthy = dbStatus === 'connected';
  const memory = process.memoryUsage();

  const healthData = {
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus,
      host: mongoose.connection.host || 'unknown',
      name: mongoose.connection.name || 'unknown',
      latencyMs: dbLatencyMs
    },
    system: {
      nodeVersion: process.version,
      memoryRssMb: (memory.rss / (1024 * 1024)).toFixed(2),
      heapUsedMb: (memory.heapUsed / (1024 * 1024)).toFixed(2)
    },
    storage: {
      provider: process.env.CLOUDINARY_CLOUD_NAME ? 'Cloudinary CDN' : 'Database'
    }
  };

  res.status(isHealthy ? 200 : 503).json(healthData);
});

// Database Connection & Server Startup
async function startServer() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error('❌ Fatal Error: MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  try {
    console.log('Connecting strictly to MongoDB Atlas...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 20, // High-performance connection pool
      minPoolSize: 5
    });
    console.log(`✅ Connected strictly to MongoDB Atlas: ${mongoose.connection.host}`);
    console.log(`📁 Active Database: ${mongoose.connection.name}`);
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB Atlas:', err.message);
    process.exit(1);
  }

  // 8-Hour Session Duration Configuration (8 Hours = 28,800 Seconds)
  const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
  const EIGHT_HOURS_SEC = 8 * 60 * 60;

  app.use(session({
    secret: process.env.SESSION_SECRET || 'rajasthan_mines_super_secret_2026',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: mongoUri,
      ttl: EIGHT_HOURS_SEC, // 8 hours in MongoDB Atlas
      autoRemove: 'native'
    }),
    cookie: {
      maxAge: EIGHT_HOURS_MS, // 8 hours in browser
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  }));

  // Global view variables
  app.use((req, res, next) => {
    res.locals.currentUser = req.session.userId ? {
      id: req.session.userId,
      username: req.session.username,
      name: req.session.name,
      role: req.session.role
    } : null;
    next();
  });

  // Mount Application Routes
  app.use('/', authRoutes);
  app.use('/', publicRoutes);
  app.use('/admin', adminRoutes);

  // Auto-seed Admin User & Sample Reference Pass in Atlas
  await seedInitialData();

  // Start HTTP Server
  const server = app.listen(PORT, () => {
    console.log(`\n========================================================`);
    console.log(`🏛️  RAJASTHAN MINES & GEOLOGY E-TRANSIT PASS SYSTEM`);
    console.log(`========================================================`);
    console.log(`🚀 Server running on:  http://localhost:${PORT}`);
    console.log(`⏱️  Session Lifetime:  8 Hours (Work Shift)`);
    console.log(`⚡ Compression:        Enabled (Gzip/Brotli)`);
    console.log(`🩺 Health Monitor:     http://localhost:${PORT}/health`);
    console.log(`☁️  Database:          MongoDB Atlas (${mongoose.connection.host})`);
    console.log(`📸 Image Storage:      Cloudinary CDN (${process.env.CLOUDINARY_CLOUD_NAME})`);
    console.log(`🔐 Admin Login:        http://localhost:${PORT}/login`);
    console.log(`========================================================\n`);
  });

  // Graceful Shutdown Management
  function handleGracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    
    server.close(async () => {
      console.log('🔒 Closed incoming HTTP connections.');
      try {
        await mongoose.connection.close(false);
        console.log('💾 MongoDB Atlas connection closed cleanly.');
        process.exit(0);
      } catch (err) {
        console.error('Error during MongoDB disconnect:', err);
        process.exit(1);
      }
    });

    setTimeout(() => {
      console.error('⚠️ Forcefully terminating shutdown after 10s timeout.');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
}

// Seed or update official Parveen User in MongoDB Atlas
async function seedInitialData() {
  try {
    const adminUsername = (process.env.ADMIN_USERNAME || 'parveen').toLowerCase().trim();
    const adminName = process.env.ADMIN_NAME || 'Parveen';

    // Migrate any legacy 'admin' user to 'parveen'
    const legacyAdmin = await User.findOne({ username: 'admin' });
    if (legacyAdmin) {
      legacyAdmin.username = adminUsername;
      legacyAdmin.name = adminName;
      await legacyAdmin.save();
      console.log(`✅ Migrated legacy user to official username: ${adminUsername} (${adminName})`);
    } else {
      const existingUser = await User.findOne({ username: adminUsername });
      if (!existingUser) {
        const user = new User({
          username: adminUsername,
          password: process.env.ADMIN_PASSWORD || 'admin123',
          name: adminName,
          role: 'admin',
          department: 'Department of Mines & Geology, Rajasthan'
        });
        await user.save();
        console.log(`✅ Official admin created in Atlas: ${adminUsername} (${adminName})`);
      }
    }
  } catch (seedErr) {
    console.error('Seed/migration error:', seedErr);
  }
}

// Start application
startServer().catch(err => {
  console.error('Fatal Server Startup Error:', err);
});
