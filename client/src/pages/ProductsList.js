import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiService from '../services/api.service';

const ProductsList = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSeoTypes, setSelectedSeoTypes] = useState(['images', 'content']);
  const [stats, setStats] = useState({
    totalProducts: 0,
    completedCount: 0,
    errorCount: 0,
    pendingCount: 0,
    processingCount: 0,
    completedByType: { images: 0, content: 0 }
  });
  const navigate = useNavigate();
  const [shopName, setShopName] = useState('');

  useEffect(() => {
    // Get shop name from localStorage
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.shopName) {
      setShopName(user.shopName);
    }

    fetchProducts();
  }, []);

  useEffect(() => {
    // Filter products whenever activeFilter or products change
    filterProducts(activeFilter);
  }, [activeFilter, products]);

  const filterProducts = (status) => {
    if (status === 'all') {
      setFilteredProducts(products);
    } else {
      setFilteredProducts(products.filter(product => {
        if (typeof product.status === 'object') {
          switch (status) {
            case 'completed':
              return product.status.images === 'completed' && product.status.content === 'completed';
            case 'error':
              return product.status.images === 'error' || product.status.content === 'error';
            case 'processing':
              return product.status.images === 'processing' || product.status.content === 'processing';
            case 'pending':
              return product.status.images === 'pending' || product.status.content === 'pending';
            default:
              return false;
          }
        }
        return product.status === status;
      }));
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await ApiService.getAllProducts();
      if (response.success) {
        setProducts(response.products || []);
        setFilteredProducts(response.products || []); // Initialize filtered products
        
        // Calculate completion counts based on the status objects
        const completedCount = response.products.filter(product => 
          product.status?.images === 'completed' && product.status?.content === 'completed'
        ).length;

        const errorCount = response.products.filter(product => 
          product.status?.images === 'error' || product.status?.content === 'error'
        ).length;

        const processingCount = response.products.filter(product => 
          product.status?.images === 'processing' || product.status?.content === 'processing'
        ).length;

        const pendingCount = response.products.filter(product => 
          product.status?.images === 'pending' || product.status?.content === 'pending'
        ).length;

        setStats({
          totalProducts: response.totalProducts || 0,
          completedCount,
          errorCount,
          pendingCount,
          processingCount,
          completedByType: response.completedByType || { images: 0, content: 0 }
        });
      } else {
        setError(response.error || 'Failed to fetch products');
      }
    } catch (error) {
      setError(error.message || 'An error occurred while fetching products');
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = async (productId) => {
    try {
      console.log('Starting SEO process with types:', selectedSeoTypes); // Debug log
      if (selectedSeoTypes.length === 0) {
        setError('Please select at least one SEO type');
        return;
      }
      
      const response = await ApiService.startSEOForProduct(productId, [...selectedSeoTypes]); // Create a new array to ensure state is fresh
      if (response) {
        navigate('/dashboard'); // Redirect to dashboard to show progress
      } else {
        setError(response.error || 'Failed to start SEO process');
      }
    } catch (error) {
      setError(error.message || 'An error occurred while starting SEO process');
    }
  };

  const handleSeoTypeChange = (type) => {
    setSelectedSeoTypes(prev => {
      const newTypes = prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type];
      
      // Ensure at least one type is selected
      if (newTypes.length === 0) {
        return prev;
      }
      
      console.log('Updated SEO types:', newTypes); // Debug log
      return newTypes;
    });
  };

  const getStatusColor = (status) => {
    if (typeof status === 'object') {
      // If both types are completed, show completed
      if (status.images === 'completed' && status.content === 'completed') {
        return 'bg-green-300 text-green-900';
      }
      // If either type has an error, show error
      if (status.images === 'error' || status.content === 'error') {
        return 'bg-red-300 text-red-900';
      }
      // If either type is processing, show processing
      if (status.images === 'processing' || status.content === 'processing') {
        return 'bg-yellow-300 text-yellow-900';
      }
      // Otherwise show pending
      return 'bg-gray-300 text-gray-900';
    }

    // Fallback for string status
    switch (status) {
      case 'completed':
        return 'bg-green-300 text-green-900';
      case 'error':
        return 'bg-red-300 text-red-900';
      case 'processing':
        return 'bg-yellow-300 text-yellow-900';
      default:
        return 'bg-gray-300 text-gray-900';
    }
  };

  const getStatusText = (status) => {
    if (typeof status === 'object') {
      // If both types are completed, show completed
      if (status.images === 'completed' && status.content === 'completed') {
        return 'Completed';
      }
      // If either type has an error, show error
      if (status.images === 'error' || status.content === 'error') {
        return 'Error';
      }
      // If either type is processing, show processing
      if (status.images === 'processing' || status.content === 'processing') {
        return 'Processing';
      }
      // Otherwise show pending
      return 'Pending';
    }
    
    // Fallback for string status
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusCardStyle = (status) => {
    const baseStyle = "p-4 rounded-lg cursor-pointer transition-all duration-300 transform hover:scale-105";
    const isActive = (status === 'all' && activeFilter === 'all') || 
                    (status !== 'all' && activeFilter === status);
    
    if (isActive) {
      return `${baseStyle} ring-2 ring-offset-2 ring-indigo-500 shadow-lg scale-105`;
    }
    return baseStyle;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 text-red-800 rounded-lg">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Products List</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-white">SEO Types:</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleSeoTypeChange('images')}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedSeoTypes.includes('images')
                    ? 'bg-indigo-500 text-white'
                    : 'bg-gray-600 text-gray-300'
                }`}
              >
                Image SEO
              </button>
              <button
                onClick={() => handleSeoTypeChange('content')}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedSeoTypes.includes('content')
                    ? 'bg-indigo-500 text-white'
                    : 'bg-gray-600 text-gray-300'
                }`}
              >
                Title & Description SEO
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div 
          className={`${getStatusCardStyle('all')} bg-gray-300`}
          onClick={() => setActiveFilter('all')}
        >
          <h3 className="text-lg font-semibold">Total</h3>
          <p className="text-2xl">{stats.totalProducts}</p>
        </div>
        <div 
          className={`${getStatusCardStyle('completed')} bg-green-300`}
          onClick={() => setActiveFilter('completed')}
        >
          <h3 className="text-lg font-semibold">Completed</h3>
          <p className="text-2xl">{stats.completedCount}</p>
          {stats.completedByType && (
            <div className="text-sm mt-1">
              <p>Images: {stats.completedByType.images}</p>
              <p>Content: {stats.completedByType.content}</p>
            </div>
          )}
        </div>
        <div 
          className={`${getStatusCardStyle('processing')} bg-yellow-300`}
          onClick={() => setActiveFilter('processing')}
        >
          <h3 className="text-lg font-semibold">Processing</h3>
          <p className="text-2xl">{stats.processingCount}</p>
        </div>
        <div 
          className={`${getStatusCardStyle('error')} bg-red-300`}
          onClick={() => setActiveFilter('error')}
        >
          <h3 className="text-lg font-semibold">Errors</h3>
          <p className="text-2xl">{stats.errorCount}</p>
        </div>
        <div 
          className={`${getStatusCardStyle('pending')} bg-gray-300`}
          onClick={() => setActiveFilter('pending')}
        >
          <h3 className="text-lg font-semibold">Pending</h3>
          <p className="text-2xl">{stats.pendingCount}</p>
        </div>
      </div>
      
      {/* Active Filter Indicator */}
      {activeFilter !== 'all' && (
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-white mr-2">Showing:</span>
            <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(activeFilter)}`}>
              {activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1)} Products
            </span>
          </div>
          <button
            onClick={() => setActiveFilter('all')}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Clear Filter
          </button>
        </div>
      )}

      {/* Status Legend */}
      <div className="mb-6 flex gap-4">
        <div className="flex items-center">
          <div className="w-4 h-4 bg-green-300 rounded mr-2"></div>
          <span className='text-white'>Completed</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-yellow-300 rounded mr-2"></div>
          <span className='text-white'>Processing</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-red-300 rounded mr-2"></div>
          <span className='text-white'>Error</span>
        </div>
        <div className="flex items-center">
          <div className="w-4 h-4 bg-gray-300 rounded mr-2"></div>
          <span className='text-white'>Pending</span>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid gap-4">
        {filteredProducts.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            No {activeFilter !== 'all' ? activeFilter : ''} products found
          </div>
        ) : (
          filteredProducts.map((product) => (
            <div
              key={product.id}
              className={`p-4 rounded-lg shadow hover:shadow-md transition-shadow ${getStatusColor(
                product.status
              )}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <a 
                    href={`https://admin.shopify.com/store/${shopName}/products/${product.id}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="font-semibold hover:text-indigo-400 transition-colors"
                  >
                    {product.title}
                  </a>
                  <p className="text-sm opacity-75">ID: {product.id}</p>
                  <p className="text-sm opacity-75">Images: {product.images}</p>
                  {product.processedAt && (
                    <p className="text-sm opacity-75">
                      Processed: {new Date(product.processedAt).toLocaleString()}
                    </p>
                  )}
                  {/* Add status details */}
                  {typeof product.status === 'object' && (
                    <div className="mt-1 space-y-1">
                      <p className="text-sm opacity-75">
                        Images: <span className={`px-1 py-0.5 rounded text-xs ${getStatusColor({ images: product.status.images })}`}>
                          {product.status.images}
                        </span>
                      </p>
                      <p className="text-sm opacity-75">
                        Content: <span className={`px-1 py-0.5 rounded text-xs ${getStatusColor({ content: product.status.content })}`}>
                          {product.status.content}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-sm ${getStatusColor(product.status)}`}>
                    {getStatusText(product.status)}
                  </span>
                  <div className="relative group">
                    <button
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleProductSelect(product.id)}
                      disabled={typeof product.status === 'object' ? 
                        (product.status.images === 'processing' || product.status.content === 'processing') :
                        product.status === 'processing'}
                    >
                      Process SEO
                    </button>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      Will process: {selectedSeoTypes.includes('images') ? 'Images' : ''} 
                      {selectedSeoTypes.includes('images') && selectedSeoTypes.includes('content') ? ' & ' : ''}
                      {selectedSeoTypes.includes('content') ? 'Title/Description' : ''}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProductsList;