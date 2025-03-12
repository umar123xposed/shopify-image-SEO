import axios from 'axios';
import AuthService from './auth.service';

// Use localhost for development, Vercel URL for production
const API_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:5000/api'
  : process.env.REACT_APP_API_URL || 'https://shopify-seo-optimizer-server.vercel.app/api';

console.log('Using API URL:', API_URL); // For debugging

// Add error handling
const handleApiError = (error) => {
  console.error('API Error:', {
    endpoint: error.config?.url,
    status: error.response?.status,
    message: error.message,
    data: error.response?.data
  });
  throw error;
};

// Use in your API calls
const makeRequest = async (method, endpoint, data = null) => {
  try {
    const response = await axios({
      method,
      url: `${API_URL}${endpoint}`,
      data,
      headers: {
        'Content-Type': 'application/json',
        ...AuthService.authHeader()
      }
    });
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
};

// Start SEO process
const startSEO = async (startFresh = false, startFromProductId = null, seoTypes = ['images', 'content']) => {
  console.log('API Service - Starting SEO with types:', seoTypes); // Debug log
  return makeRequest('POST', '/start', { 
    startFresh, 
    startFromProductId, 
    seoTypes: Array.isArray(seoTypes) ? seoTypes : ['images', 'content'] 
  });
};

// Get SEO status
const getSEOStatus = async () => {
  return makeRequest('GET', '/status');
};

// Stop SEO process
const stopSEO = async () => {
  try {
    const response = await axios({
      method: 'POST',
      url: `${API_URL}/stop`,
      headers: {
        'Content-Type': 'application/json',
        ...AuthService.authHeader()
      }
    });
    return response.data;
  } catch (error) {
    console.error('Stop SEO Error:', error.response?.data || error.message);
    throw error;
  }
};

// Get all products
const getAllProducts = async () => {
  return makeRequest('GET', '/products');
};

// Start SEO for specific product
const startSEOForProduct = async (productId, seoTypes = ['images', 'content']) => {
  console.log('API Service - Starting product SEO with types:', seoTypes); // Debug log
  return makeRequest('POST', '/start', { 
    startFromProductId: productId, 
    seoTypes: Array.isArray(seoTypes) ? seoTypes : ['images', 'content']
  });
};

// Export all functions
const ApiService = {
  startSEO,
  getSEOStatus,
  stopSEO,
  getAllProducts,
  startSEOForProduct
};

export default ApiService; 