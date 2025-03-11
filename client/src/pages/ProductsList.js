import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiService from '../services/api.service';

const ProductsList = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalProducts: 0,
    completedCount: 0,
    errorCount: 0,
    pendingCount: 0,
    processingCount: 0
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
      setFilteredProducts(products.filter(product => product.status === status));
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await ApiService.getAllProducts();
      if (response.success) {
        setProducts(response.products || []);
        setFilteredProducts(response.products || []); // Initialize filtered products
        setStats({
          totalProducts: response.totalProducts || 0,
          completedCount: response.completedCount || 0,
          errorCount: response.errorCount || 0,
          pendingCount: response.pendingCount || 0,
          processingCount: response.processingCount || 0
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
      const response = await ApiService.startSEOForProduct(productId);
      if (response) {
        navigate('/dashboard'); // Redirect to dashboard to show progress
      } else {
        setError(response.error || 'Failed to start SEO process');
      }
    } catch (error) {
      setError(error.message || 'An error occurred while starting SEO process');
    }
  };

  const getStatusColor = (status) => {
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
      <h1 className="text-3xl font-bold mb-6 text-white">Products List</h1>
      
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
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-sm ${getStatusColor(product.status)}`}>
                    {product.status}
                  </span>
                  <button
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handleProductSelect(product.id)}
                    disabled={product.status === 'processing'}
                  >
                    Process SEO
                  </button>
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