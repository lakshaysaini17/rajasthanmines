const mongoose = require('mongoose');

const passSchema = new mongoose.Schema({
  passNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    index: true
  },
  vehicleNumber: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    index: true
  },
  status: {
    type: String,
    enum: ['Confirmed', 'Generated', 'In Transit', 'Completed', 'Expired', 'Cancelled'],
    default: 'Confirmed',
    index: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  confirmedAt: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: true,
    index: true
  },
  // Trader / Dealer / Stockist Details
  traderName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  traderGst: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  // Mineral & Weights
  mineralType: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  netWeight: {
    type: Number,
    required: true,
    min: 0
  },
  tareWeight: {
    type: Number,
    required: true,
    min: 0
  },
  grossWeight: {
    type: Number,
    min: 0
  },
  // Rate & Taxes
  ratePerMT: {
    type: Number,
    default: 0
  },
  royaltyTaxPercent: {
    type: Number,
    default: 0
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    default: 0
  },
  // Driver Details
  driverName: {
    type: String,
    required: true,
    trim: true
  },
  driverMobile: {
    type: String,
    required: true,
    trim: true
  },
  // Consignee Details
  consigneeName: {
    type: String,
    required: true,
    trim: true
  },
  consigneeAddress: {
    type: String,
    required: true,
    trim: true
  },
  approxDistance: {
    type: Number,
    required: true,
    min: 1
  },
  weighBridge: {
    type: String,
    required: true,
    trim: true
  },
  // Photos
  frontImage: {
    type: String,
    default: ''
  },
  sideImage: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Performance Database Indexes
passSchema.index({ status: 1, validUntil: 1 });
passSchema.index({ createdAt: -1 });
passSchema.index({ vehicleNumber: 1, createdAt: -1 });
passSchema.index({ traderName: 1, createdAt: -1 });

// Calculate grossWeight, taxAmount, and totalAmount before saving
passSchema.pre('save', function(next) {
  if (this.netWeight !== undefined && this.tareWeight !== undefined) {
    this.grossWeight = Number((parseFloat(this.netWeight || 0) + parseFloat(this.tareWeight || 0)).toFixed(2));
  }
  const baseValue = (parseFloat(this.netWeight) || 0) * (parseFloat(this.ratePerMT) || 0);
  const taxPct = (parseFloat(this.royaltyTaxPercent) || 0) / 100;
  this.taxAmount = Number((baseValue * taxPct).toFixed(2));
  this.totalAmount = Number((baseValue + this.taxAmount).toFixed(2));
  next();
});

// Helper static method to generate a unique Rajasthan style pass number
passSchema.statics.generatePassNumber = async function(prefix = 'NLME') {
  let isUnique = false;
  let newPassNumber = '';
  while (!isUnique) {
    const randomDigits = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    newPassNumber = `${prefix}${randomDigits}`;
    const existing = await this.findOne({ passNumber: newPassNumber }).lean();
    if (!existing) {
      isUnique = true;
    }
  }
  return newPassNumber;
};

// Formatted Date Helper for Rajasthan Official Pass format
passSchema.methods.formatDateOfficial = function(dateField) {
  if (!dateField) return 'N/A';
  const d = new Date(dateField);
  if (isNaN(d.getTime())) return 'N/A';
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getDate()).padStart(2, '0');
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  
  return `${day}-${month}-${year} ${strHours}:${minutes}:${seconds} ${ampm}`;
};

module.exports = mongoose.model('Pass', passSchema);
