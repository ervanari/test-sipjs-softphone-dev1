'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import Link from 'next/link';

interface UserConfig {
  id?: string;
  userId: string;
  sipServer: string;
  sipUsername: string;
  sipPassword: string;
  sipDomain: string;
  sipPort: number | '';
  useWebSocket: boolean;
}

export default function UserConfigPage() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Form state
  const [config, setConfig] = useState<UserConfig>({
    userId: '',
    sipServer: '',
    sipUsername: '',
    sipPassword: '',
    sipDomain: '',
    sipPort: 5060,
    useWebSocket: true
  });

  // Fetch user config on load
  useEffect(() => {
    async function fetchUserConfig() {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/user-config?userId=${user.id}`);
        
        if (!response.ok) {
          if (response.status !== 404) { // 404 is expected if user has no config yet
            throw new Error('Failed to fetch user configuration');
          }
        } else {
          const result = await response.json();
          if (result.data) {
            setConfig(result.data);
          }
        }
      } catch (err) {
        console.error('Error fetching user config:', err);
        setError('Failed to load configuration. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchUserConfig();
  }, [user]);

  // Update form state
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked :
              type === 'number' ? (value === '' ? '' : parseInt(value, 10)) :
              value
    }));
  };

  // Save configuration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;
    
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      // Ensure sipPort is a valid number before saving
      const configToSave = {
        ...config,
        userId: user.id,
        sipPort: config.sipPort === '' ? 5060 : config.sipPort
      };
      
      const response = await fetch('/api/user-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configToSave),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save configuration');
      }
      
      setSuccessMessage('Configuration saved successfully!');
      
      // Success message will remain visible until user navigates away
      // This gives users enough time to see and click the "Go to Call Page" button
    } catch (err: any) {
      console.error('Error saving config:', err);
      setError(err.message || 'An error occurred while saving your configuration');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full">
          <h1 className="text-xl font-bold text-[#128C7E] mb-4">Authentication Required</h1>
          <p className="text-gray-600 mb-4">Please log in to configure your SIP account.</p>
          <Link href="/" className="bg-[#128C7E] text-white py-2 px-4 rounded font-medium hover:bg-[#0c6b5f] focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:ring-opacity-50">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#128C7E]">SIP Account Configuration</h1>
        <p className="text-gray-600">Configure your SIP account settings for the softphone</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#128C7E]"></div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-6">
          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded">
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded">
              <div className="flex justify-between items-center">
                <div>{successMessage}</div>
                <Link href="/call" className="bg-green-600 text-white py-2 px-4 rounded font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50">
                  Go to Call Page
                </Link>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* SIP Server */}
              <div>
                <label htmlFor="sipServer" className="block text-sm font-medium text-gray-700 mb-1">
                  SIP Server (WebSocket URL)
                </label>
                <input
                  type="text"
                  id="sipServer"
                  name="sipServer"
                  value={config.sipServer}
                  onChange={handleChange}
                  placeholder="wss://sip-server.example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#128C7E] focus:border-[#128C7E]"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  WebSocket URL for your SIP server
                </p>
              </div>
              
              {/* SIP Domain */}
              <div>
                <label htmlFor="sipDomain" className="block text-sm font-medium text-gray-700 mb-1">
                  SIP Domain
                </label>
                <input
                  type="text"
                  id="sipDomain"
                  name="sipDomain"
                  value={config.sipDomain}
                  onChange={handleChange}
                  placeholder="example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#128C7E] focus:border-[#128C7E]"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Your SIP domain
                </p>
              </div>
              
              {/* SIP Username */}
              <div>
                <label htmlFor="sipUsername" className="block text-sm font-medium text-gray-700 mb-1">
                  SIP Username
                </label>
                <input
                  type="text"
                  id="sipUsername"
                  name="sipUsername"
                  value={config.sipUsername}
                  onChange={handleChange}
                  placeholder="username"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#128C7E] focus:border-[#128C7E]"
                  required
                />
              </div>
              
              {/* SIP Password */}
              <div>
                <label htmlFor="sipPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  SIP Password
                </label>
                <input
                  type="password"
                  id="sipPassword"
                  name="sipPassword"
                  value={config.sipPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#128C7E] focus:border-[#128C7E]"
                  required
                />
              </div>
              
              {/* SIP Port */}
              <div>
                <label htmlFor="sipPort" className="block text-sm font-medium text-gray-700 mb-1">
                  SIP Port
                </label>
                <input
                  type="number"
                  id="sipPort"
                  name="sipPort"
                  value={config.sipPort}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-[#128C7E] focus:border-[#128C7E]"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Default: 5060 (SIP), 5061 (SIPS), or 443 (WSS)
                </p>
              </div>
              
              {/* Use WebSocket */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useWebSocket"
                  name="useWebSocket"
                  checked={config.useWebSocket}
                  onChange={handleChange}
                  className="h-4 w-4 text-[#128C7E] focus:ring-[#128C7E] border-gray-300 rounded"
                />
                <label htmlFor="useWebSocket" className="ml-2 block text-sm text-gray-700">
                  Use WebSocket Transport
                </label>
              </div>
            </div>
            
            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="bg-[#128C7E] text-white py-2 px-6 rounded-md font-medium hover:bg-[#0c6b5f] focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </div>
      )}
      
      {/* Help Section */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6 border border-blue-100">
        <h2 className="text-lg font-semibold text-blue-800 mb-3">Need Help?</h2>
        <p className="text-blue-700 mb-4">
          To configure your SIP account, you'll need the following information from your SIP provider:
        </p>
        <ul className="list-disc pl-5 text-blue-700 space-y-2">
          <li>SIP Server WebSocket URL (usually starts with wss://)</li>
          <li>SIP Domain (the domain part of your SIP address)</li>
          <li>SIP Username and Password</li>
          <li>SIP Port (usually 5060 for SIP, 5061 for SIPS, or 443 for WSS)</li>
        </ul>
        <p className="mt-4 text-blue-700">
          If you're unsure about any of these settings, please contact your SIP service provider.
        </p>
      </div>
    </div>
  );
}
