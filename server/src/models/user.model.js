const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true 
  },
  shopName: { 
    type: String, 
    required: true,
    trim: true 
  },
  shopifyKey: { 
    type: String, 
    required: true 
  },
  geminiKey: { 
    type: String, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  lastLogin: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model('User', userSchema); 