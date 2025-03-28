import React, { useEffect, useState } from 'react';

import ApiService from '../services/api.service';



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
  const status = image?.status || 'pending';
  const statusColor = statusColors[status] || statusColors.pending;
  const statusIcon = statusIcons[status] || null;

 

  return (
    <div className={`bg-gray-800 rounded-lg overflow-hidden border ${statusColor}`}>
      <div className="relative aspect-square">
        {image?.src && (
          <img
            src={image.newImageSrc || image.src}
            alt={image.newAltText || 'Product image'}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = 'https://via.placeholder.com/400?text=Image+Not+Found';
            }}
          />
        )}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gray-700 animate-pulse" />
        )}
      </div>
      
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            {statusIcon}
            <span className={`ml-2 font-medium ${
              status === 'completed' ? 'text-green-400' : 
              status === 'processing' ? 'text-yellow-400' : 
              status === 'error' ? 'text-red-400' : 'text-gray-400'
            }`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        </div>
        {image?.newAltText && (
          <div className="mt-2">
            <p className="text-sm text-gray-300 font-medium">New Alt Text:</p>
            <p className="text-xs text-gray-400 mt-1">{image.newAltText}</p>
          </div>
        )}
        {image?.newFilename && (
          <div className="mt-2">
            <p className="text-sm text-gray-300 font-medium">New Filename:</p>
            <p className="text-xs text-gray-400 mt-1">{image.newFilename}</p>
          </div>
        )}
        <div className="mt-2 space-y-2">
          {image?.productId && (
            <div>
              <p className="text-sm text-gray-300 font-medium">Product Info:</p>
              <p className="text-xs text-gray-400">ID: {image.productId}</p>
              <p className="text-xs text-gray-400">Title: {image.productTitle}</p>
            </div>
          )}
          {(image?.oldImageId || image?.newImageId) && (
            <div>
              <p className="text-sm text-gray-300 font-medium">Image IDs:</p>
              {image.oldImageId && <p className="text-xs text-gray-400">Old: {image.oldImageId}</p>}
              {image.newImageId && <p className="text-xs text-gray-400">New: {image.newImageId}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function Dashboard() {
  const [status, setStatus] = useState({
    isRunning: false,
    totalProducts: 0,
    completedByType: {
      images: 0,
      content: 0
    },
    currentProduct: null,
    currentImage: null,
    processedImages: [],
    lastError: null,
    apiErrorCount: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showStartFromModal, setShowStartFromModal] = useState(false);
  const [startFromProductId, setStartFromProductId] = useState('');
  const [shopname, setShopName]= useState("")

  // Fetch status periodically
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await ApiService.getSEOStatus();
        // Ensure processedImages is always an array and deduplicated
        const processedImages = Array.isArray(data.processedImages) ? data.processedImages : [];
        setStatus({
          ...data,
          processedImages: [...new Map(processedImages.map(img => [img.id, img])).values()]
            .sort((a, b) => new Date(b.processedAt || 0) - new Date(a.processedAt || 0))
            .slice(0, 8)
        });
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
  useEffect(() => {
    // Get shop name from localStorage
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.shopName) {
      setShopName(user.shopName);
    }
  }, []);

  const handleStart = async (startFresh = false, productId = null) => {
    try {
      setLoading(true);
      setError('');
      
      await ApiService.startSEO(startFresh, productId);
      
      // Fetch updated status
      const data = await ApiService.getSEOStatus();
      setStatus(data);
    } catch (err) {
      console.error('Error starting SEO process:', err);
      setError(err.message || 'Failed to start SEO process');
    } finally {
      setLoading(false);
      setShowStartFromModal(false);
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

  const handleStartFromSpecific = () => {
    if (!startFromProductId.trim()) {
      setError('Please enter a product ID');
      return;
    }
    handleStart(false, startFromProductId.trim());
  };

  // Calculate progress percentage for each type
  const progressPercentage = {
    images: status.totalProducts > 0 
      ? Math.round((status.completedByType.images / status.totalProducts) * 100) 
      : 0,
    content: status.totalProducts > 0 
      ? Math.round((status.completedByType.content / status.totalProducts) * 100) 
      : 0
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">SEO Dashboard</h1>
          <div className="flex gap-4">
            {!status.isRunning ? (
              <>
                <button
                  onClick={() => handleStart(false)}
                  disabled={loading}
                  className={`px-4 py-2 rounded-md ${
                    status.completedByType.images > 0 
                      ? 'bg-indigo-600 hover:bg-indigo-700' 
                      : 'bg-gray-600 cursor-not-allowed'
                  } transition-colors`}
                >
                  Resume
                </button>
                <button
                  onClick={() => setShowStartFromModal(true)}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                >
                  Start from ID
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
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-lg font-medium mb-2">Total Products</h3>
            <p className="text-3xl font-bold">{status.totalProducts}</p>
          </div>
          
          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-lg font-medium mb-2">Image SEO Completed</h3>
            <p className="text-3xl font-bold">{status.completedByType.images}</p>
            <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercentage.images}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-400 mt-1">{progressPercentage.images}% Complete</p>
          </div>

          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-lg font-medium mb-2">Content SEO Completed</h3>
            <p className="text-3xl font-bold">{status.completedByType.content}</p>
            <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercentage.content}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-400 mt-1">{progressPercentage.content}% Complete</p>
          </div>

          <div className="bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-lg font-medium mb-2">Overall Progress</h3>
            <p className="text-3xl font-bold">
              {Math.round((progressPercentage.images + progressPercentage.content) / 2)}%
            </p>
            <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
              <div 
                className="bg-indigo-600 h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(progressPercentage.images + progressPercentage.content) / 2}%` }}
              ></div>
            </div>
          </div>
        </div>
        
        {status.currentProduct && (
          <div className="bg-gray-700/50 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium mb-2">Currently Processing</h3>
            <p className="text-indigo-400">
              <a href={`https://admin.shopify.com/store/${shopname}/products/${status.currentProduct.id}`} target='_blank' rel="noopener noreferrer" 
                    className="font-semibold hover:text-green-400 transition-colors">{status.currentProduct.title || 'Unknown Product'}</a>
              {status.currentProduct.seoTypes && (
                <span className="text-sm text-gray-400 ml-2">
                  ({status.currentProduct.seoTypes.join(' & ')} optimization)
                </span>
              )}
            </p>
            {status.currentImage && (
              <p className="text-sm text-gray-400 mt-1">
                Processing image: {status.currentImage.id}
              </p>
            )}
          </div>
        )}

        {/* Error Display */}
        {status.lastError && (
          <div className="mt-4 p-4 bg-red-900/50 rounded-lg border border-red-700">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-300">
                  {status.apiErrorCount > 0 ? (
                    <>
                      API Error Count: {status.apiErrorCount}/{3}
                      {status.apiErrorCount >= 3 && (
                        <span className="block text-red-400 mt-1">
                          Process stopped automatically due to multiple API errors.
                          Please check your API key and restart the process.
                        </span>
                      )}
                    </>
                  ) : (
                    'Error occurred'
                  )}
                </h3>
                <div className="mt-2 text-sm text-red-200">
                  {status.lastError}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Start from Product ID Modal */}
        {showStartFromModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Start from Specific Product ID</h3>
              <input
                type="text"
                value={startFromProductId}
                onChange={(e) => setStartFromProductId(e.target.value)}
                placeholder="Enter Product ID"
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 mb-4"
              />
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowStartFromModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartFromSpecific}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md"
                >
                  Start
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Recent Images */}
        {status.processedImages && status.processedImages.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Recently Processed Images</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...new Map(status.processedImages.map(img => [img.id, img])).values()] // Deduplicate by image ID
                .sort((a, b) => new Date(b.processedAt || 0) - new Date(a.processedAt || 0)) // Sort by processedAt date
                .slice(0, 8) // Strictly limit to 8 images
                .map((image, index) => (
                  <ImageCard 
                    key={`${image.id}-${image.processedAt}`} // Unique key combining ID and timestamp
                    image={image} 
                    index={index} 
                  />
                ))
              }
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Dashboard; 