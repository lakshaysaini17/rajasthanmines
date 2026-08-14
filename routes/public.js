const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Pass = require('../models/Pass');

// Helper to get host base URL
function getBaseUrl(req) {
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${protocol}://${host}`;
}

// Root route: Redirect directly to admin dashboard (or login)
router.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/admin/dashboard');
  }
  res.redirect('/login');
});

// Direct Public Pass View (Scan QR code or click direct link)
async function renderDirectPass(req, res) {
  try {
    const passNumber = (req.params.passNumber || '').trim().toUpperCase();
    const pass = await Pass.findOne({ passNumber });

    if (!pass) {
      return res.status(404).render('public/not-found', {
        title: 'Pass Not Found | Rajasthan Mines & Geology',
        searchedNumber: passNumber
      });
    }

    const baseUrl = getBaseUrl(req);
    const passPublicUrl = `${baseUrl}/pass/${pass.passNumber}`;
    const qrCodeDataUrl = await QRCode.toDataURL(passPublicUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 120,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });

    res.render('public/print-pass', {
      title: `eTransit Pass - ${pass.passNumber}`,
      pass,
      qrCodeDataUrl,
      passPublicUrl,
      formattedGenerated: pass.formatDateOfficial(pass.generatedAt),
      formattedConfirmed: pass.formatDateOfficial(pass.confirmedAt),
      formattedExpiry: pass.formatDateOfficial(pass.validUntil)
    });
  } catch (err) {
    console.error('Error rendering pass:', err);
    res.status(500).send('Error loading transit pass.');
  }
}

router.get('/pass/:passNumber', renderDirectPass);
router.get('/pass/:passNumber/print', renderDirectPass);
router.get('/verify/:passNumber', renderDirectPass);

module.exports = router;
