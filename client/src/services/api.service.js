import axios from 'axios';
import AuthService from './auth.service';

const API_URL = process.env.REACT_APP_API_URL || 'https://shopify-seo-optimizer-server.vercel.app/api';

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
        // Add any other headers you need
      }
    });
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
};

// Start SEO process
const startSEO = async (startFresh = false, startFromProductId = null) => {
  try {
    const response = await axios.post(
      `${API_URL}/start`,
      { startFresh, startFromProductId },
      { headers: AuthService.authHeader() }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Failed to start SEO process' };
  }
};

// Get SEO status
const getSEOStatus = async () => {
  try {
    const response = await axios.get(
      `${API_URL}/status`,
      { headers: AuthService.authHeader() }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Failed to get SEO status' };
  }
};

// Stop SEO process
const stopSEO = async () => {
  try {
    const response = await axios.post(
      `${API_URL}/stop`,
      {},
      { headers: AuthService.authHeader() }
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Failed to stop SEO process' };
  }
};

// Export all functions
const ApiService = {
  startSEO,
  getSEOStatus,
  stopSEO
};

export default ApiService; 