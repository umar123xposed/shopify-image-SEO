import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiService from '../services/api.service';
import AuthService from '../services/auth.service';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function ImageCard({ image, index }) {
  const statusColors = {
    processing: 'border-yellow-400 bg-yellow-900/20',
    completed: 'border-green-400 bg-green-900/20',
    error: 'border-red-400 bg-red-900/20'
  };

  const statusIcons = {
    processing: (
      <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    completed: (
      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  };

  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div 
      className={`rounded-xl shadow-lg overflow-hidden border-2 ${statusColors[image.status]} backdrop-blur-sm transition-all duration-500 hover:scale-[1.02] hover:shadow-xl`}
      style={{ 
        animation: `fadeIn 0.5s ease-out ${index * 0.1}s forwards`
      }}
    >
      <div className="relative group bg-gray-900/30">
        <div className="w-full h-48 flex items-center justify-center overflow-hidden">
          <img 
            src={image.src} 
            alt={image.newAltText || 'Processing image'} 
            className={`w-full h-full object-cover transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
          />
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            {statusIcons[image.status]}
            <span className={`ml-2 font-medium ${
              image.status === 'completed' ? 'text-green-400' : 
              image.status === 'processing' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {image.status.charAt(0).toUpperCase() + image.status.slice(1)}
            </span>
          </div>
        </div>
        {image.newFilename && (
          <div className="mt-2">
            <p className="text-sm text-gray-300 font-medium">New Filename:</p>
            <p className="text-xs text-gray-400 mt-1">{image.newFilename}</p>
          </div>
        )}
        
        {image.newAltText && (
          <div className="mt-2">
            <p className="text-sm text-gray-300 font-medium">New Alt Text:</p>
            <p className="text-xs text-gray-400 mt-1">{image.newAltText}</p>
          </div>
        )}
        
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }) {
  return (
    <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 shadow-xl border border-white/20">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-300">{title}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
        </div>
        <div className="p-3 bg-white/5 rounded-lg">
          {icon}
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const [status, setStatus] = useState({
    isRunning: false,
    totalProducts: 0,
    completedProducts: 0,
    currentProduct: null,
    currentImage: null,
    processedImages: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // Fetch status periodically
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await ApiService.getSEOStatus();
        setStatus(data);
        setError('');
      } catch (err) {
        console.error('Error fetching status:', err);
        setError('Failed to fetch status. Please try again.');
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    
    return () => clearInterval(interval);
  }, []);

  // Get user info
  useEffect(() => {
    const currentUser = AuthService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
  }, []);

  const handleStart = async (startFresh = false) => {
    try {
      setLoading(true);
      setError('');
      
      await ApiService.startSEO(startFresh);
      
      // Fetch updated status
      const data = await ApiService.getSEOStatus();
      setStatus(data);
    } catch (err) {
      console.error('Error starting SEO process:', err);
      setError(err.message || 'Failed to start SEO process');
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setLoading(true);
      setError('');
      
      await ApiService.stopSEO();
      
      // Fetch updated status
      const data = await ApiService.getSEOStatus();
      setStatus(data);
    } catch (err) {
      console.error('Error stopping SEO process:', err);
      setError(err.message || 'Failed to stop SEO process');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    AuthService.logout();
    navigate('/');
  };

  // Calculate progress percentage
  const progressPercentage = status.totalProducts > 0 
    ? Math.round((status.completedProducts / status.totalProducts) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 shadow-md">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Shopify Image SEO Optimizer</h1>
          
          <div className="flex items-center space-x-4">
            {user && (
              <div className="text-sm text-gray-300">
                <span className="font-medium">{user.shopName}</span>
              </div>
            )}
            <button 
              onClick={handleLogout}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Status Card */}
        <div className="bg-gray-800 rounded-xl shadow-xl p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">SEO Optimization Status</h2>
              <p className="text-gray-400">
                {status.isRunning 
                  ? 'Optimization in progress...' 
                  : status.completedProducts > 0 
                    ? 'Optimization paused' 
                    : 'Ready to start optimization'}
              </p>
            </div>
            
            <div className="mt-4 md:mt-0 flex space-x-3">
              {!status.isRunning ? (
                <>
                  <button
                    onClick={() => handleStart(false)}
                    disabled={loading}
                    className={`px-4 py-2 rounded-md ${
                      status.completedProducts > 0 
                        ? 'bg-indigo-600 hover:bg-indigo-700' 
                        : 'bg-gray-600 cursor-not-allowed'
                    } transition-colors`}
                  >
                    Resume
                  </button>
                  <button
                    onClick={() => handleStart(true)}
                    disabled={loading}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                  >
                    Start Fresh
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStop}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
          
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded mb-6" role="alert">
              <span className="block sm:inline">{error}</span>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-2">Total Products</h3>
              <p className="text-3xl font-bold">{status.totalProducts}</p>
            </div>
            
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-2">Completed</h3>
              <p className="text-3xl font-bold">{status.completedProducts}</p>
            </div>
            
            <div className="bg-gray-700/50 rounded-lg p-4">
              <h3 className="text-lg font-medium mb-2">Progress</h3>
              <p className="text-3xl font-bold">{progressPercentage}%</p>
            </div>
          </div>
          
          <div className="w-full bg-gray-700 rounded-full h-4 mb-2">
            <div 
              className="bg-indigo-600 h-4 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          
          {status.currentProduct && (
            <p className="text-sm text-gray-400">
              Currently processing: <span className="font-medium text-indigo-400">{status.currentProduct}</span>
            </p>
          )}
        </div>
        
        {/* Recent Images */}
        {status.processedImages && status.processedImages.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Recently Processed Images</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {status.processedImages.map((image, index) => (
                <ImageCard key={image.id || index} image={image} index={index} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Dashboard; 