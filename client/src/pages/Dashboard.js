import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

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
              <svg className="animate-spin h-8 w-8 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          )}
        </div>
        <div className="absolute top-2 right-2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-black/50 text-white backdrop-blur-sm shadow-lg">
            {statusIcons[image.status]}
            <span className="ml-2 capitalize">{image.status}</span>
          </span>
        </div>
      </div>
      <div className="p-4">
        <h4 className="font-semibold text-gray-100 mb-2 line-clamp-1">{image.productTitle}</h4>
        {image.newAltText && (
          <p className="text-sm text-gray-300">
            <span className="font-medium text-gray-200">New Alt Text:</span>
            <br/>
            <span className="italic">{image.newAltText}</span>
          </p>
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
  const navigate = useNavigate();
  const [status, setStatus] = useState({
    isRunning: false,
    totalProducts: 0,
    completedProducts: 0,
    currentProduct: null,
    currentImage: null,
    processedImages: []
  });
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const storedCredentials = localStorage.getItem('seoCredentials');
    if (!storedCredentials) {
      navigate('/');
      return;
    }
    setCredentials(JSON.parse(storedCredentials));

    const interval = setInterval(() => {
      if (!isRateLimited) {
        fetchStatus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [navigate, isRateLimited]);

  useEffect(() => {
    if (isRateLimited) {
      const timer = setTimeout(() => {
        setIsRateLimited(false);
        setError('');
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [isRateLimited]);

  const fetchStatus = async () => {
    try {
      const response = await axios.get(`${API_URL}/status`);
      setStatus(response.data);
      setError('');
      setIsRateLimited(false);
    } catch (error) {
      if (error.response?.status === 429) {
        setIsRateLimited(true);
        setError('Rate limit reached. Please wait a moment...');
      } else {
        setError('Failed to fetch status');
      }
    }
  };

  const handleStart = async (startFresh) => {
    if (isRateLimited) {
      setError('Please wait a moment before trying again...');
      return;
    }

    try {
      setError('');

      if (!credentials) {
        setError('No credentials found. Please set up the application first.');
        navigate('/');
        return;
      }

      await axios.post(`${API_URL}/start`, {
        ...credentials,
        startFresh
      });
      
      await fetchStatus();
    } catch (error) {
      if (error.response?.status === 429) {
        setIsRateLimited(true);
        setError('Rate limit reached. Please wait a moment...');
      } else {
        const errorMessage = error.response?.data?.message || 'Failed to start SEO process';
        setError(errorMessage);
        
        if (error.response?.status === 400) {
          localStorage.removeItem('seoCredentials');
          navigate('/');
          return;
        }
      }
    }
  };

  const handleStop = async () => {
    if (isRateLimited) {
      setError('Please wait a moment before trying again...');
      return;
    }

    try {
      setError('');
      await axios.post(`${API_URL}/stop`);
      await fetchStatus();
    } catch (error) {
      if (error.response?.status === 429) {
        setIsRateLimited(true);
        setError('Rate limit reached. Please wait a moment...');
      } else {
        setError('Failed to stop SEO process');
      }
    }
  };

  const handleReset = () => {
    localStorage.removeItem('seoCredentials');
    navigate('/');
  };

  const progress = status.totalProducts > 0 
    ? Math.round((status.completedProducts / status.totalProducts) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      {/* Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.3),rgba(255,255,255,0))]" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000" />
      </div>

      {/* Content */}
      <div className="relative min-h-screen">
        <div className={`w-full transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Header */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-xl p-6">
              <div className="flex justify-between items-center">
                <h1 className="text-4xl font-bold text-white">
                  SEO Dashboard
                </h1>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors duration-200"
                >
                  Reset Credentials
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard 
                title="Total Products" 
                value={status.totalProducts}
                icon={
                  <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                }
              />
              
              <StatCard 
                title="Completed" 
                value={status.completedProducts}
                icon={
                  <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
              
              <StatCard 
                title="Progress" 
                value={`${progress}%`}
                icon={
                  <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
              />
            </div>

            {/* Progress Bar */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-xl p-6">
              <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-200 bg-blue-900/50">
                      Task Progress
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold inline-block text-blue-200">
                      {progress}%
                    </span>
                  </div>
                </div>
                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded-full bg-blue-900/30">
                  <div
                    style={{ width: `${progress}%` }}
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                  />
                </div>
              </div>

              {status.currentProduct && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Currently Processing</h3>
                  <div className="bg-white/5 p-4 rounded-lg backdrop-blur-sm">
                    <p className="text-blue-200">{status.currentProduct}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Image Processing Section */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-xl p-6">
              <h3 className="text-xl font-bold text-white mb-6">
                Image Processing
              </h3>
              
              {/* Current Image */}
              {status.currentImage && (
                <div className="mb-8">
                  <h4 className="text-sm font-medium text-gray-300 mb-4">Current Image</h4>
                  <ImageCard image={status.currentImage} index={0} />
                </div>
              )}

              {/* Recently Processed Images */}
              {status.processedImages && status.processedImages.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-300 mb-4">Recently Processed Images</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {status.processedImages.map((image, index) => (
                      <ImageCard key={`${image.id}-${index}`} image={image} index={index + 1} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Control Buttons */}
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-xl p-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {status.isRunning ? (
                  <button
                    onClick={handleStop}
                    className="px-8 py-3 text-white bg-gradient-to-r from-red-600 to-pink-600 rounded-lg hover:from-red-500 hover:to-pink-500 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200"
                  >
                    <span className="flex items-center">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Stop SEO Process
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleStart(true)}
                      className="px-8 py-3 text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg hover:from-blue-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200"
                    >
                      <span className="flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        Start Fresh
                      </span>
                    </button>
                    <button
                      onClick={() => handleStart(false)}
                      className="px-8 py-3 text-blue-200 border-2 border-blue-400/50 rounded-lg hover:bg-blue-400/10 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-200"
                    >
                      <span className="flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Resume from Checkpoint
                      </span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-900/30 border-l-4 border-red-500 p-4 rounded-md backdrop-blur-sm">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard; 