const express = require('express');
const router = express.Router();
const cloudinary = require('cloudinary').v2;
const Pass = require('../models/Pass');
const User = require('../models/User');
const upload = require('../middleware/upload');
const { requireAuth } = require('../middleware/auth');

// Protect all admin routes
router.use(requireAuth);

// Configure Cloudinary if keys are present
const hasCloudinaryKeys = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinaryKeys) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
    api_key: process.env.CLOUDINARY_API_KEY.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET.trim()
  });
}

// Helper to upload file buffer to Cloudinary or fallback to permanent Base64 Data URI in DB
async function processImageUpload(file, fallback = '') {
  if (!file || !file.buffer) return fallback;

  // Try Cloudinary first if configured
  if (hasCloudinaryKeys) {
    try {
      const uploadPromise = new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'rajasthan_mines_passes', resource_type: 'image' },
          (error, result) => {
            if (error) return reject(error);
            resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      });
      const cloudUrl = await uploadPromise;
      return cloudUrl;
    } catch (err) {
      console.warn('Cloudinary upload error, using permanent Database storage:', err.message);
    }
  }

  // Permanent Database Cloud Storage (Base64 Data URI)
  const base64Data = file.buffer.toString('base64');
  return `data:${file.mimetype};base64,${base64Data}`;
}

// Helper for date formatting in dashboard top bar
function getDashboardDateStr() {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = days[d.getDay()];
  const dayNum = d.getDate();
  const monthName = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${dayName}, ${dayNum} ${monthName}, ${year}, ${hours}:${minutes}`;
}

// GET /admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const totalAll = await Pass.countDocuments();

    // Today's count
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const todayCount = await Pass.countDocuments({
      createdAt: { $gte: startOfToday, $lte: endOfToday }
    });

    // Aggregates for Total Revenue and Total Mineral Weight
    const agg = await Pass.aggregate([
      {
        $group: {
          _id: null,
          totalMineral: { $sum: '$netWeight' },
          totalRevenue: { $sum: '$totalAmount' }
        }
      }
    ]);

    const totalMineral = agg.length > 0 ? agg[0].totalMineral.toFixed(1) : '0.0';
    const totalRevenue = agg.length > 0 ? agg[0].totalRevenue.toFixed(2) : '0.00';

    // Recent passes (limit to 10 for dashboard)
    const recentPasses = await Pass.find()
      .sort({ createdAt: -1 })
      .limit(10);

    res.render('admin/dashboard', {
      title: 'Dashboard | Mines & Geology Rajasthan',
      activeMenu: 'dashboard',
      user: { name: req.session.name || 'Administrator', username: req.session.username || 'admin' },
      currentDateStr: getDashboardDateStr(),
      todayStr: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      stats: {
        totalAll,
        todayCount,
        totalRevenue: Number(totalRevenue).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        totalMineral: Number(totalMineral).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      },
      passes: recentPasses,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Error loading dashboard');
  }
});

// GET /admin/passes - All Passes Page
router.get('/passes', async (req, res) => {
  try {
    const { q, status, mineral, page = 1 } = req.query;
    const limit = 20;
    const skip = (parseInt(page) - 1) * limit;

    const filter = {};
    if (q) {
      const regex = new RegExp(q.trim(), 'i');
      filter.$or = [
        { passNumber: regex },
        { vehicleNumber: regex },
        { traderName: regex },
        { consigneeName: regex },
        { location: regex }
      ];
    }
    if (status && status !== 'All') {
      filter.status = status;
    }
    if (mineral && mineral !== 'All') {
      filter.mineralType = mineral;
    }

    const totalPassesCount = await Pass.countDocuments(filter);
    const passes = await Pass.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const mineralsList = await Pass.distinct('mineralType');

    res.render('admin/passes', {
      title: 'All Passes | Mines & Geology Rajasthan',
      activeMenu: 'passes',
      user: { name: req.session.name || 'Administrator', username: req.session.username || 'admin' },
      currentDateStr: getDashboardDateStr(),
      passes,
      mineralsList,
      filters: {
        q: q || '',
        status: status || 'All',
        mineral: mineral || 'All'
      },
      pagination: {
        page: parseInt(page),
        totalPages: Math.ceil(totalPassesCount / limit) || 1,
        totalItems: totalPassesCount
      },
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('All passes error:', err);
    res.status(500).send('Error loading passes');
  }
});

// GET /admin/passes/new - Form to create a new pass
router.get('/passes/new', async (req, res) => {
  try {
    const generatedPassNo = await Pass.generatePassNumber('NLME');
    const now = new Date();
    const expiry = new Date(now.getTime() + 20 * 60 * 60 * 1000);

    const formatForInput = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    let prefill = {};
    if (req.query.from) {
      const sourcePass = await Pass.findById(req.query.from);
      if (sourcePass) {
        prefill = sourcePass.toObject();
        delete prefill._id;
        delete prefill.passNumber;
      }
    }

    res.render('admin/form', {
      title: 'Generate New Pass | Mines & Geology Rajasthan',
      activeMenu: 'new-pass',
      user: { name: req.session.name || 'Administrator', username: req.session.username || 'admin' },
      currentDateStr: getDashboardDateStr(),
      isEdit: false,
      pass: {
        passNumber: generatedPassNo,
        vehicleNumber: prefill.vehicleNumber || '',
        status: prefill.status || 'Confirmed',
        generatedAt: formatForInput(now),
        confirmedAt: formatForInput(new Date(now.getTime() + 4 * 60 * 1000)),
        validUntil: formatForInput(expiry),
        traderName: prefill.traderName || '',
        traderGst: prefill.traderGst || '',
        location: prefill.location || '',
        mineralType: prefill.mineralType || '',
        netWeight: prefill.netWeight !== undefined ? prefill.netWeight : '',
        tareWeight: prefill.tareWeight !== undefined ? prefill.tareWeight : '',
        ratePerMT: prefill.ratePerMT !== undefined ? prefill.ratePerMT : '',
        royaltyTaxPercent: prefill.royaltyTaxPercent !== undefined ? prefill.royaltyTaxPercent : '',
        driverName: prefill.driverName || '',
        driverMobile: prefill.driverMobile || '',
        consigneeName: prefill.consigneeName || '',
        consigneeAddress: prefill.consigneeAddress || '',
        approxDistance: prefill.approxDistance || '',
        weighBridge: prefill.weighBridge || '',
        frontImage: prefill.frontImage || '',
        sideImage: prefill.sideImage || ''
      },
      error: null
    });
  } catch (err) {
    console.error('New pass form error:', err);
    res.redirect('/admin/dashboard?error=' + encodeURIComponent('Could not open new pass form.'));
  }
});

// POST /admin/passes - Create new pass
router.post('/passes', upload.fields([
  { name: 'frontImageFile', maxCount: 1 },
  { name: 'sideImageFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const data = req.body;

    let frontImagePath = data.frontImage || '';
    let sideImagePath = data.sideImage || '';

    if (req.files && req.files.frontImageFile && req.files.frontImageFile[0]) {
      frontImagePath = await processImageUpload(req.files.frontImageFile[0], frontImagePath);
    }
    if (req.files && req.files.sideImageFile && req.files.sideImageFile[0]) {
      sideImagePath = await processImageUpload(req.files.sideImageFile[0], sideImagePath);
    }

    const netW = parseFloat(data.netWeight) || 0;
    const tareW = parseFloat(data.tareWeight) || 0;
    const rate = parseFloat(data.ratePerMT) || 0;
    const taxPct = parseFloat(data.royaltyTaxPercent) || 0;
    const taxAmt = (netW * rate * (taxPct / 100));
    const totalAmt = (netW * rate) + taxAmt;

    const newPass = new Pass({
      passNumber: (data.passNumber || await Pass.generatePassNumber()).trim().toUpperCase(),
      vehicleNumber: data.vehicleNumber.trim().toUpperCase(),
      status: data.status || 'Confirmed',
      generatedAt: data.generatedAt ? new Date(data.generatedAt) : new Date(),
      confirmedAt: data.confirmedAt ? new Date(data.confirmedAt) : new Date(),
      validUntil: data.validUntil ? new Date(data.validUntil) : new Date(Date.now() + 20 * 3600000),
      traderName: data.traderName.trim(),
      traderGst: data.traderGst.trim().toUpperCase(),
      location: data.location.trim(),
      mineralType: data.mineralType.trim(),
      netWeight: netW,
      tareWeight: tareW,
      grossWeight: Number((netW + tareW).toFixed(2)),
      ratePerMT: rate,
      royaltyTaxPercent: taxPct,
      taxAmount: Number(taxAmt.toFixed(2)),
      totalAmount: Number(totalAmt.toFixed(2)),
      driverName: data.driverName.trim(),
      driverMobile: data.driverMobile.trim(),
      consigneeName: data.consigneeName.trim(),
      consigneeAddress: data.consigneeAddress.trim(),
      approxDistance: parseInt(data.approxDistance) || 1,
      weighBridge: data.weighBridge.trim(),
      frontImage: frontImagePath,
      sideImage: sideImagePath,
      createdBy: req.session.userId
    });

    await newPass.save();
    res.redirect(`/admin/dashboard?success=` + encodeURIComponent(`Pass ${newPass.passNumber} generated successfully!`));
  } catch (err) {
    console.error('Pass create error:', err);
    res.render('admin/form', {
      title: 'Generate New Pass | Mines & Geology Rajasthan',
      activeMenu: 'new-pass',
      user: { name: req.session.name || 'Administrator', username: req.session.username || 'admin' },
      currentDateStr: getDashboardDateStr(),
      isEdit: false,
      pass: req.body,
      error: 'Failed to create pass: ' + err.message
    });
  }
});

// GET /admin/passes/:id/edit - Edit pass form
router.get('/passes/:id/edit', async (req, res) => {
  try {
    const pass = await Pass.findById(req.params.id);
    if (!pass) {
      return res.redirect('/admin/dashboard?error=' + encodeURIComponent('Pass not found.'));
    }

    const formatForInput = (d) => {
      if (!d) return '';
      const date = new Date(d);
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };

    const passObj = pass.toObject();
    passObj.generatedAt = formatForInput(pass.generatedAt);
    passObj.confirmedAt = formatForInput(pass.confirmedAt);
    passObj.validUntil = formatForInput(pass.validUntil);

    res.render('admin/form', {
      title: `Edit Pass - ${pass.passNumber}`,
      activeMenu: 'passes',
      user: { name: req.session.name || 'Administrator', username: req.session.username || 'admin' },
      currentDateStr: getDashboardDateStr(),
      isEdit: true,
      pass: passObj,
      error: null
    });
  } catch (err) {
    console.error('Edit pass load error:', err);
    res.redirect('/admin/dashboard?error=' + encodeURIComponent('Error loading pass.'));
  }
});

// POST /admin/passes/:id/edit - Save edits
router.post('/passes/:id/edit', upload.fields([
  { name: 'frontImageFile', maxCount: 1 },
  { name: 'sideImageFile', maxCount: 1 }
]), async (req, res) => {
  try {
    const pass = await Pass.findById(req.params.id);
    if (!pass) {
      return res.redirect('/admin/dashboard?error=' + encodeURIComponent('Pass not found.'));
    }

    const data = req.body;

    if (req.files && req.files.frontImageFile && req.files.frontImageFile[0]) {
      pass.frontImage = await processImageUpload(req.files.frontImageFile[0], pass.frontImage);
    }
    if (req.files && req.files.sideImageFile && req.files.sideImageFile[0]) {
      pass.sideImage = await processImageUpload(req.files.sideImageFile[0], pass.sideImage);
    }

    const netW = parseFloat(data.netWeight) || 0;
    const tareW = parseFloat(data.tareWeight) || 0;
    const rate = parseFloat(data.ratePerMT) || 0;
    const taxPct = parseFloat(data.royaltyTaxPercent) || 0;
    const taxAmt = (netW * rate * (taxPct / 100));
    const totalAmt = (netW * rate) + taxAmt;

    pass.passNumber = data.passNumber.trim().toUpperCase();
    pass.vehicleNumber = data.vehicleNumber.trim().toUpperCase();
    pass.status = data.status || pass.status;
    if (data.generatedAt) pass.generatedAt = new Date(data.generatedAt);
    if (data.confirmedAt) pass.confirmedAt = new Date(data.confirmedAt);
    if (data.validUntil) pass.validUntil = new Date(data.validUntil);
    pass.traderName = data.traderName.trim();
    pass.traderGst = data.traderGst.trim().toUpperCase();
    pass.location = data.location.trim();
    pass.mineralType = data.mineralType.trim();
    pass.netWeight = netW;
    pass.tareWeight = tareW;
    pass.grossWeight = Number((netW + tareW).toFixed(2));
    pass.ratePerMT = rate;
    pass.royaltyTaxPercent = taxPct;
    pass.taxAmount = Number(taxAmt.toFixed(2));
    pass.totalAmount = Number(totalAmt.toFixed(2));
    pass.driverName = data.driverName.trim();
    pass.driverMobile = data.driverMobile.trim();
    pass.consigneeName = data.consigneeName.trim();
    pass.consigneeAddress = data.consigneeAddress.trim();
    pass.approxDistance = parseInt(data.approxDistance) || pass.approxDistance;
    pass.weighBridge = data.weighBridge.trim();

    await pass.save();
    res.redirect(`/admin/dashboard?success=` + encodeURIComponent(`Pass ${pass.passNumber} updated successfully!`));
  } catch (err) {
    console.error('Update pass error:', err);
    res.redirect('/admin/dashboard?error=' + encodeURIComponent('Failed to update pass: ' + err.message));
  }
});

// POST /admin/passes/:id/delete - Delete pass
router.post('/passes/:id/delete', async (req, res) => {
  try {
    const deleted = await Pass.findByIdAndDelete(req.params.id);
    if (deleted) {
      res.redirect('/admin/dashboard?success=' + encodeURIComponent(`Pass ${deleted.passNumber} was deleted.`));
    } else {
      res.redirect('/admin/dashboard?error=' + encodeURIComponent('Pass not found.'));
    }
  } catch (err) {
    console.error('Delete error:', err);
    res.redirect('/admin/dashboard?error=' + encodeURIComponent('Failed to delete pass.'));
  }
});

// GET /admin/settings - Settings page
router.get('/settings', (req, res) => {
  res.render('admin/settings', {
    title: 'Settings | Mines & Geology Rajasthan',
    activeMenu: 'settings',
    user: { name: req.session.name || 'Administrator', username: req.session.username || 'admin' },
    currentDateStr: getDashboardDateStr(),
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// POST /admin/settings - Save settings/password
router.post('/settings', async (req, res) => {
  try {
    const { name, newPassword, confirmPassword } = req.body;
    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.redirect('/admin/settings?error=' + encodeURIComponent('User not found.'));
    }

    if (name) {
      user.name = name.trim();
      req.session.name = user.name;
    }

    if (newPassword) {
      if (newPassword !== confirmPassword) {
        return res.redirect('/admin/settings?error=' + encodeURIComponent('New passwords do not match.'));
      }
      user.password = newPassword;
    }

    await user.save();
    res.redirect('/admin/settings?success=' + encodeURIComponent('Settings updated successfully!'));
  } catch (err) {
    console.error('Settings error:', err);
    res.redirect('/admin/settings?error=' + encodeURIComponent('Failed to update settings.'));
  }
});

// GET /admin/export/csv - CSV Export
router.get('/export/csv', async (req, res) => {
  try {
    const passes = await Pass.find().sort({ createdAt: -1 });
    let csv = 'Rawaana No,Vehicle,Trader,Location,Mineral,Net Weight (MT),Tare Weight (MT),Total Price (INR),Driver,Mobile,Consignee,Valid Until,Status\n';
    
    passes.forEach(p => {
      csv += `"${p.passNumber}","${p.vehicleNumber}","${p.traderName.replace(/"/g, '""')}","${p.location.replace(/"/g, '""')}","${p.mineralType}","${p.netWeight}","${p.tareWeight}","${p.totalAmount || 0}","${p.driverName}","${p.driverMobile}","${p.consigneeName.replace(/"/g, '""')}","${p.formatDateOfficial(p.validUntil)}","${p.status}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="rajasthan-rawaana-passes-' + Date.now() + '.csv"');
    res.send(csv);
  } catch (err) {
    console.error('CSV export error:', err);
    res.redirect('/admin/dashboard?error=' + encodeURIComponent('CSV export failed.'));
  }
});

module.exports = router;
