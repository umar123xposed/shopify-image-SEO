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
  currentProductSeoTypes: {
    type: [String],
    default: []
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
  // Track processed products by SEO type
  processedProductsByType: {
    images: {
      type: [String],
      default: []
    },
    content: {
      type: [String],
      default: []
    }
  },
  // Track completion counts by SEO type
  completedByType: {
    images: {
      type: Number,
      default: 0
    },
    content: {
      type: Number,
      default: 0
    }
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
  },
  productsWithErrors: [String], // Array of product IDs that had errors
  productCompletionTimes: {
    type: Map,
    of: Date,
    default: {}
  },
  error: String,
  // Track optimization details with SEO types
  optimizationDetails: {
    type: Map,
    of: {
      completedAt: Date,
      seoTypes: [String],
      status: String,
      error: String
    },
    default: {}
  }
});

// Compound index to ensure one progress record per user
progressSchema.index({ userId: 1, shopName: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema); 