const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  shopName: { 
    type: String, 
    required: true 
  },
  lastProductId: { 
    type: String,
    default: null
  },
  currentProductId: {
    type: String,
    default: null
  },
  currentProductTitle: {
    type: String,
    default: null
  },
  completedProducts: { 
    type: Number, 
    default: 0 
  },
  totalProducts: { 
    type: Number, 
    default: 0 
  },
  isRunning: { 
    type: Boolean, 
    default: false 
  },
  currentProduct: {
    type: String,
    default: null
  },
  currentImage: {
    type: Object,
    default: null
  },
  processedImages: {
    type: Array,
    default: []
  },
  processedProductIds: {
    type: [String],
    default: []
  },
  startedAt: {
    type: Date,
    default: null
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  lastError: {
    type: String,
    default: null
  },
  apiErrorCount: {
    type: Number,
    default: 0
  }
});

// Compound index to ensure one progress record per user
progressSchema.index({ userId: 1, shopName: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema); 