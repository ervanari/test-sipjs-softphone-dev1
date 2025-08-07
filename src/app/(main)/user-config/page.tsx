'use client';

/**
 * User Configuration Page
 *
 * This page allows users to configure their SIP account settings.
 * The form and functionality have been updated to match the SIPRegistration component.
 *
 * Changes made:
 * 1. Added SIPRegistration-style form state (username, password, domain, wsServer)
 * 2. Updated the useEffect hook to populate these form state variables
 * 3. Implemented WebSocket URL validation and parsing logic from SIPRegistration
 * 4. Updated the form layout and styling to match SIPRegistration
 * 5. Added helpful examples and guidance for WebSocket server input
 */

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
    sipDomain: 'jsmwebrtc.my.id', // Default domain
    sipPort: 5060,
    useWebSocket: true
  });
  
  // SIPRegistration-style form state for better UX
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState('jsmwebrtc.my.id'); // Default domain
  const [wsServer, setWsServer] = useState('wss://jsmwebrtc.my.id:443/ws'); // Default WebSocket server URL

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
            const userData = result.data;
            setConfig(userData);
            
            // Also update the SIPRegistration-style form state
            setUsername(userData.sipUsername);
            setPassword(userData.sipPassword);
            setDomain(userData.sipDomain);
            
            // Construct WebSocket URL from the saved config
            const protocol = userData.useWebSocket ? 'wss://' : 'sip:';
            const port = userData.sipPort ? `:${userData.sipPort}` : '';
            const path = userData.useWebSocket ? '/ws' : '';
            const constructedWsServer = `${protocol}${userData.sipServer}${port}${path}`;
            setWsServer(constructedWsServer);
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

  // This handleChange function is no longer needed as we're using direct state setters
  // for username, password, domain, and wsServer

  // Save configuration
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;
    
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      // Clean and validate the WebSocket server URL
      let cleanWsServer = wsServer.trim();
      
      // Ensure there are no double protocols
      cleanWsServer = cleanWsServer.replace(/wss?:\/\/\s+wss?:\/\//, 'wss://');
      
      console.log('Cleaned WebSocket server URL:', cleanWsServer);
      
      // Validate the URL format
      try {
        // Add protocol if missing for URL validation
        let urlToValidate = cleanWsServer;
        if (!urlToValidate.startsWith('wss://') && !urlToValidate.startsWith('ws://')) {
          urlToValidate = `wss://${urlToValidate}`;
        }
        
        // This will throw an error if the URL is invalid
        new URL(urlToValidate);
      } catch (error) {
        console.error('Invalid WebSocket server URL:', cleanWsServer);
        throw new Error(`Invalid WebSocket server URL: ${cleanWsServer}`);
      }
      
      // Parse the WebSocket server URL to extract server, port, and whether to use WebSocket
      let serverHost = cleanWsServer; // Use the cleaned URL
      let serverPort = 5060; // Default port
      let useWs = true;
      
      console.log('Parsing WebSocket URL for database storage:', cleanWsServer);
      
      // Remove protocol (ws:// or wss://)
      if (serverHost.startsWith('wss://')) {
        serverHost = serverHost.substring(6);
      } else if (serverHost.startsWith('ws://')) {
        serverHost = serverHost.substring(5);
      }
      
      // Trim again after removing protocol
      serverHost = serverHost.trim();
      
      // Extract port if present
      const portIndex = serverHost.indexOf(':');
      if (portIndex !== -1) {
        const portStr = serverHost.substring(portIndex + 1).split('/')[0];
        serverPort = parseInt(portStr, 10) || 5060;
        serverHost = serverHost.substring(0, portIndex);
      }
      
      // Check if /ws path is present
      useWs = cleanWsServer.includes('/ws');
      
      // Remove any path from the server host
      const pathIndex = serverHost.indexOf('/');
      if (pathIndex !== -1) {
        serverHost = serverHost.substring(0, pathIndex);
      }
      
      // Final trim of the server host
      serverHost = serverHost.trim();
      
      console.log('Parsed WebSocket URL components:', {
        serverHost,
        serverPort,
        useWs
      });
      
      // Prepare the configuration to save
      const configToSave = {
        userId: user.id,
        sipServer: serverHost,
        sipUsername: username,
        sipPassword: password,
        sipDomain: domain,
        sipPort: serverPort,
        useWebSocket: useWs
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
      
      // Update the config state with the saved values
      setConfig(configToSave);
      
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
      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#128C7E]"></div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-[#128C7E] text-white p-4">
            <h2 className="text-xl font-semibold">User Configuration</h2>
          </div>
          
          {error && (
            <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}
          
          {successMessage && (
            <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4">
              <div className="flex justify-between items-center">
                <div>{successMessage}</div>
                <Link href="/call" className="bg-green-600 text-white py-2 px-4 rounded font-medium hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50">
                  Go to Call Page
                </Link>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="p-6 space-y-6">
              {/* Username */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full text-gray-800 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
                  required
                />
              </div>

              {/* Domain */}
              <div>
                <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">
                  Domain
                </label>
                <input
                  id="domain"
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="Domain"
                  className="w-full text-gray-800 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full text-gray-800 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
                  required
                />
              </div>

              {/* WebSocket Server */}
              <div>
                <label htmlFor="wsServer" className="block text-sm font-medium text-gray-700 mb-1">
                  WebSocket Server
                </label>
                <input
                  id="wsServer"
                  type="text"
                  value={wsServer}
                  onChange={(e) => setWsServer(e.target.value)}
                  placeholder="e.g., test-webrtc.example.com:8089/ws"
                  className="w-full text-gray-800 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
                  required
                />
                <p className="mt-1 text-sm text-gray-500">
                  Enter the WebSocket server address. You can include or omit the protocol (wss://),
                  port number (:8089), and path (/ws). The system will handle the formatting.
                </p>
                <div className="mt-2 text-xs text-gray-500">
                  <p className="font-medium">Examples:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>test-webrtc.example.com</li>
                    <li>test-webrtc.example.com:8089</li>
                    <li>test-webrtc.example.com/ws</li>
                    <li>test-webrtc.example.com:8089/ws</li>
                    <li>wss://test-webrtc.example.com:8089/ws</li>
                  </ul>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSaving || !username || !password || !wsServer || !domain}
                className="w-full bg-[#128C7E] hover:bg-[#0e6b5e] text-white font-bold py-3 px-4 rounded-md disabled:opacity-50 transition duration-200"
              >
                {isSaving ? (
                  <div className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </div>
                ) : (
                  "Save Configuration"
                )}
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
