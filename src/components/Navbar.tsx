'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import SIPConnectionStatus from './SIPConnectionStatus';

interface NavbarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

export default function Navbar({ isOpen, toggleSidebar }: NavbarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  
  // Handle logout
  const handleLogout = async () => {
    await logout();
  };

  // Get page title based on current path
  const getPageTitle = () => {
    switch (pathname) {
      case '/':
      case '/dashboard':
        return 'Dashboard';
      case '/call-history':
        return 'Call History';
      case '/user-config':
        return 'User Configuration';
      default:
        return 'SIP Softphone';
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 h-16 fixed top-0 right-0 left-0 z-10 ml-0 md:ml-16">
      <div className={`flex items-center justify-between h-full px-4 ${isOpen ? 'md:ml-64' : ''} transition-all duration-300`}>
        {/* Left side - Hamburger menu and title */}
        <div className="flex items-center">
          {/* Hamburger menu button */}
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none mr-3"
            aria-label="Toggle sidebar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {isOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
          
          {/* Page title */}
          <h1 className="text-xl font-semibold text-gray-800">
            {getPageTitle()}
          </h1>
        </div>
        
        {/* Right side - User info, SIP status, and logout */}
        {user && (
          <div className="flex items-center">
            <div className="mr-3 text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-700">{user.username}</p>
              <SIPConnectionStatus />
            </div>
            <div className="h-10 w-10 rounded-full bg-[#128C7E] flex items-center justify-center text-white mr-3">
              {user.username ? user.username.charAt(0).toUpperCase() : 'U'}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
