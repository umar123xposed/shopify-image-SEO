import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';


const API_URL = process.env.REACT_APP_API_URL || 'https://shopify-seo-optimizer-server.vercel.app/api';

function Setup() {
  const [credentials, setCredentials] = useState({
    shopName: '',
    shopifyKey: '',
    geminiKey: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!credentials.shopName || !credentials.shopifyKey || !credentials.geminiKey) {
        throw new Error('All fields are required');
      }

      localStorage.setItem('seoCredentials', JSON.stringify(credentials));
      
      if (process.env.REACT_APP_ENABLE_LOGGING === 'true') {
        console.log('Credentials stored successfully');
      }
      navigate('/dashboard');
    } catch (error) {
      localStorage.removeItem('seoCredentials');
      const errorMessage = error.message || 'Failed to store credentials';
      setError(errorMessage);
      if (process.env.REACT_APP_ENABLE_ERROR_REPORTING === 'true') {
        console.error('Error storing credentials:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.3),rgba(255,255,255,0))]" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000" />
      </div>

      <div className={`relative min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        <div className="max-w-md w-full backdrop-blur-lg bg-white/10 rounded-2xl shadow-2xl p-8 transform transition-all duration-500 hover:scale-[1.01]">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-200 via-indigo-200 to-purple-200 bg-clip-text text-transparent mb-2 animate-gradient">
              Shopify Image SEO
            </h1>
            <p className="text-gray-300 text-sm">
              Optimize your product images with AI-powered SEO
            </p>
          </div>
          
          {error && (
            <div className="mb-6 bg-red-900/30 border-l-4 border-red-500 p-4 rounded-md backdrop-blur-sm animate-shake">
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

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-5">
              {[
                {
                  label: 'Shop Name',
                  name: 'shopName',
                  placeholder: 'your-shop-name',
                  subtitle: 'without .myshopify.com'
                },
                {
                  label: 'Shopify API Key',
                  name: 'shopifyKey',
                  placeholder: 'shpat_xxxxx...',
                  subtitle: 'Admin API access token',
                  type: 'password'
                },
                {
                  label: 'Gemini API Key',
                  name: 'geminiKey',
                  placeholder: 'AIzaxxxxx...',
                  subtitle: 'Google AI API key',
                  type: 'password'
                }
              ].map((field, index) => (
                <div key={field.name} 
                  className={`transform transition-all duration-500 ${mounted ? 'translate-x-0 opacity-100' : 'translate-x-20 opacity-0'}`} 
                  style={{ transitionDelay: `${index * 150}ms` }}
                >
                  <label className="block text-sm font-medium text-gray-200">
                    {field.label}
                    <span className="text-xs text-gray-400 ml-1">({field.subtitle})</span>
                  </label>
                  <div className="mt-1">
                    <input
                      type={field.type || 'text'}
                      name={field.name}
                      value={credentials[field.name]}
                      onChange={handleChange}
                      className="block w-full px-4 py-3 rounded-lg bg-white/5 border border-gray-500/30 text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 hover:bg-white/10"
                      placeholder={field.placeholder}
                      required
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className={`transform transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`} style={{ transitionDelay: '450ms' }}>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-3 px-4 rounded-lg text-sm font-semibold text-white transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 overflow-hidden"
              >
                <span className="absolute inset-0 w-full h-full transition-all duration-300 ease-out transform translate-x-0 -skew-x-12 bg-gradient-to-r from-purple-500 to-indigo-500 group-hover:translate-x-full group-hover:scale-102" />
                <span className="absolute inset-0 w-full h-full transition-all duration-300 ease-out transform skew-x-12 bg-gradient-to-r from-indigo-500 to-purple-500 group-hover:translate-x-full group-hover:scale-102" />
                <span className="absolute bottom-0 left-0 w-full h-1 transition-all duration-300 ease-out transform translate-x-0 bg-gradient-to-r from-purple-500 to-indigo-500 group-hover:translate-x-full" />
                <span className="relative flex items-center">
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Setting up...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2 transition-transform duration-300 transform group-hover:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      Store Credentials & Continue
                    </>
                  )}
                </span>
              </button>
            </div>
          </form>

          <div className={`mt-6 transform transition-all duration-500 ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`} style={{ transitionDelay: '600ms' }}>
            <p className="text-center text-xs text-gray-400">
              Your credentials are stored securely in your browser's local storage.
              <br />
              They are never sent to our servers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Setup; 