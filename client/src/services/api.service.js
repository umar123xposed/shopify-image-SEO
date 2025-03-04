import axios from 'axios';
import AuthService from './auth.service';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

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