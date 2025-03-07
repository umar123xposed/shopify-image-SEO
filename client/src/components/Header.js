import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import AuthService from '../services/auth.service';

const Header = () => {
  const location = useLocation();
  const isAuthenticated = AuthService.isAuthenticated();
  const user = AuthService.getCurrentUser();

  const handleLogout = () => {
    AuthService.logout();
    window.location.href = '/';
  };

  const getLinkClass = (path) => {
    const baseClass = "px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center";
    return location.pathname === path
      ? `${baseClass} bg-indigo-500/20 text-indigo-400 border border-indigo-500/30`
      : `${baseClass} text-gray-400 hover:bg-gray-700 hover:text-indigo-400`;
  };

  if (!isAuthenticated) return null;

  return (
    <nav className="bg-gray-800 border-b border-gray-700 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex items-center space-x-2">
              <svg 
                className="w-8 h-8 text-indigo-500" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span className="text-white text-xl font-bold tracking-tight">
                SEO King
              </span>
            </div>
            <div className="ml-10 flex items-center space-x-3">
              <Link to="/dashboard" className={getLinkClass('/dashboard')}>
                <svg 
                  className="w-4 h-4 mr-2" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                  />
                </svg>
                Dashboard
              </Link>
              <Link to="/products" className={getLinkClass('/products')}>
                <svg 
                  className="w-4 h-4 mr-2" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                  />
                </svg>
                Products
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {user && user.shopName && (
              <div className="flex items-center px-3 py-2 bg-gray-700/50 rounded-lg border border-gray-600">
                <svg 
                  className="w-4 h-4 text-indigo-400 mr-2" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                  />
                </svg>
                <span className="text-sm">
                  <span className="text-gray-400 font-medium">Store:</span>
                  <span className="ml-1 text-indigo-400 font-semibold">{user.shopName}</span>
                </span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 border border-transparent transition-all duration-200"
            >
              <svg 
                className="w-4 h-4 mr-2" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Header; 