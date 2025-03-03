import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Helper to get auth token
const getToken = () => localStorage.getItem('authToken');

// Helper to set auth headers
const authHeader = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Register a new user
const register = async (email, password, shopName, shopifyKey, geminiKey) => {
  try {
    console.log('Registering user with:', { email, shopName });
    const response = await axios.post(`${API_URL}/auth/register`, {
      email,
      password,
      shopName,
      shopifyKey,
      geminiKey
    });
    
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    
    return response.data;
  } catch (error) {
    console.error('Registration error:', error);
    throw error.response?.data || { message: 'Registration failed' };
  }
};

// Login user
const login = async (email, password) => {
  try {
    console.log('Logging in user:', email);
    const response = await axios.post(`${API_URL}/auth/login`, {
      email,
      password
    });
    
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    
    return response.data;
  } catch (error) {
    console.error('Login error:', error);
    throw error.response?.data || { message: 'Login failed' };
  }
};

// Logout user
const logout = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  localStorage.removeItem('seoCredentials');
};

// Get current user
const getCurrentUser = () => {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
};

// Check if user is authenticated
const isAuthenticated = () => {
  return !!getToken();
};

// Get user profile
const getUserProfile = async () => {
  try {
    const response = await axios.get(`${API_URL}/auth/me`, {
      headers: authHeader()
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || { message: 'Failed to get user profile' };
  }
};

// Export all functions
const AuthService = {
  register,
  login,
  logout,
  getCurrentUser,
  isAuthenticated,
  getUserProfile,
  authHeader
};

export default AuthService; 