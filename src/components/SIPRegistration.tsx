"use client";
import { useState, useEffect } from "react";
import { initSIP } from "../lib/sipClient";

interface SIPRegistrationProps {
  onRegistered: (domain: string, username: string) => void;
  onIncomingCall: (invitation: any) => void;
  onMessageReceived?: (message: string, from: string) => void;
  initialDomain?: string;
  initialUsername?: string;
  userId?: string;
}

// Interface for SIP data stored in localStorage
interface SIPData {
  username: string;
  password: string;
  wsServer: string;
  domain: string;
}

export default function SIPRegistration({
  onRegistered,
  onIncomingCall,
  onMessageReceived,
  initialDomain,
  initialUsername,
  userId
}: SIPRegistrationProps) {
  const [username, setUsername] = useState(initialUsername || "");
  const [password, setPassword] = useState("");
  const [domain, setDomain] = useState(initialDomain || "jsmwebrtc.my.id"); // Default domain
  const [wsServer, setWsServer] = useState("wss://jsmwebrtc.my.id:443/ws"); // Default WebSocket server URL
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [error, setError] = useState("");
  const [autoConnecting, setAutoConnecting] = useState(false);

  // Load SIP data from localStorage on component mount if not provided via props
  useEffect(() => {
    // If we have initialDomain and initialUsername from props, don't load from localStorage
    if (initialDomain && initialUsername) {
      return;
    }
    
    const savedSipData = localStorage.getItem('sipData');

    if (savedSipData) {
      try {
        const data: SIPData = JSON.parse(savedSipData);

        // Update form fields with saved data
        setUsername(data.username);
        setPassword(data.password);
        setWsServer(data.wsServer);
        // Set domain if available in saved data, otherwise use default
        if (data.domain) {
          setDomain(data.domain);
        }

        // Auto-connect with saved credentials
        // setAutoConnecting(true);
        // registerWithSIP(data.username, data.password, data.wsServer, data.domain || domain);
      } catch (err) {
        console.error("Error parsing saved SIP data:", err);
      }
    }
  }, [initialDomain, initialUsername]);

  // Function to register with SIP
  const registerWithSIP = async (usernameValue: string, passwordValue: string, wsServerValue: string, domainValue: string = domain) => {
    setIsRegistering(true);
    setError("");

    try {
      // Construct SIP URI from username and domain
      const sipUriValue = `sip:${usernameValue}@${domainValue}`;

      console.log("SIP URI:", sipUriValue);

      // Save to localStorage
      const sipData: SIPData = {
        username: usernameValue,
        password: passwordValue,
        wsServer: wsServerValue,
        domain: domainValue
      };
      localStorage.setItem('sipData', JSON.stringify(sipData));

      // Clean and validate the WebSocket server URL
      let cleanWsServer = wsServerValue.trim();
      
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
      
      // Initialize SIP client
      await initSIP({
        uri: sipUriValue,
        password: passwordValue,
        wsServer: cleanWsServer,
        onInvite: onIncomingCall,
        onMessage: onMessageReceived,
        onRegistrationFailed: (error) => {
          setError(`Registration failed: ${error.message}`);
          setIsRegistering(false);
          setIsRegistered(false);
          setAutoConnecting(false);
        },
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      });

      // If we have a userId, save the SIP configuration to the database
      if (userId) {
        try {
          // Parse the WebSocket server URL to extract server, port, and whether to use WebSocket
          let serverHost = cleanWsServer; // Use the cleaned URL
          let serverPort = 443; // Default port
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
            serverPort = parseInt(portStr, 10) || 443;
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
          
          await fetch('/api/user-config', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId,
              sipServer: serverHost,
              sipUsername: usernameValue,
              sipPassword: passwordValue,
              sipDomain: domainValue,
              sipPort: serverPort,
              useWebSocket: useWs
            }),
          });
          console.log('SIP configuration saved to database');
        } catch (error) {
          console.error('Error saving SIP configuration to database:', error);
          // Don't fail the registration process if saving to database fails
        }
      }

      // Only set as registered if initSIP Promise resolves successfully
      setIsRegistered(true);
      onRegistered(domainValue, usernameValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register SIP account");
      console.error("SIP registration error:", err);
      setIsRegistered(false);
    } finally {
      setIsRegistering(false);
      setAutoConnecting(false);
    }
  };

  const handleRegister = async () => {
    await registerWithSIP(username, password, wsServer, domain);
  };

  if (isRegistered) {
    return null; // We don't need to show this when registered as we show status in the header
  }

  if (autoConnecting) {
    return (
      <div className="bg-white rounded-lg shadow-md overflow-hidden p-6">
        <div className="flex items-center justify-center">
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-[#128C7E]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-[#128C7E] font-medium">Menyambung otomatis ke SIP...</span>
        </div>
      </div>
    );
  }

  return (
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

      <div className="p-6 space-y-6">
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

        <button
          onClick={handleRegister}
          disabled={isRegistering || !username || !password || !wsServer || !domain}
          className="w-full bg-[#128C7E] hover:bg-[#0e6b5e] text-white font-bold py-3 px-4 rounded-md disabled:opacity-50 transition duration-200"
        >
          {isRegistering ? (
            <div className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            </div>
          ) : (
            "Connect"
          )}
        </button>
      </div>
    </div>
  );
}
