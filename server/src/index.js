require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const seoRouter = require('./routes/seo.routes');
const authRouter = require('./routes/auth.routes');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Rate limiting configurations
const statusLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute for status endpoint
  message: { message: 'Too many status requests, please try again later.' }
});

const actionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute for action endpoints
  message: { message: 'Too many action requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per 15 minutes for auth endpoints
  message: { message: 'Too many authentication attempts, please try again later.' }
});

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

// Apply rate limiting to specific routes
app.use('/api/status', statusLimiter);
app.use('/api/start', actionLimiter);
app.use('/api/stop', actionLimiter);
app.use('/api/auth', authLimiter);

// API routes
app.use('/api/auth', authRouter); // Auth routes should come before protected routes
app.use('/api', seoRouter);       // SEO routes are protected

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: process.env.NODE_ENV || 'development' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
}); 