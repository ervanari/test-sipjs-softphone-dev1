"use client";
import { useState } from "react";
import { initSIP } from "../lib/sipClient";

interface SIPRegistrationProps {
  onRegistered: (domain: string) => void;
  onIncomingCall: (invitation: any) => void;
  onMessageReceived?: (message: string, from: string) => void;
}

export default function SIPRegistration({ onRegistered, onIncomingCall, onMessageReceived }: SIPRegistrationProps) {
  const [sipUri, setSipUri] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [wsServer, setWsServer] = useState("wss://jsmwebrtc.my.id:443/ws");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    setIsRegistering(true);
    setError("");

    try {
      // Extract domain from SIP URI, handling different formats
      const atIndex = sipUri.lastIndexOf('@');
      const domain = atIndex !== -1 ? sipUri.substring(atIndex + 1) : null;

      console.log("SIP URI:", sipUri);
      if (!domain) {
        throw new Error("Invalid SIP URI format. Expected format: user@domain or sip:user@domain");
      }

      // Initialize SIP client
      await initSIP({
        uri: sipUri,
        password: password,
        wsServer: wsServer,
        onInvite: onIncomingCall,
        onMessage: onMessageReceived,
        onRegistrationFailed: (error) => {
          setError(`Registration failed: ${error.message}`);
          setIsRegistering(false);
          setIsRegistered(false);
        },
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      });

      // Only set as registered if initSIP Promise resolves successfully
      setIsRegistered(true);
      onRegistered(domain);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register SIP account");
      console.error("SIP registration error:", err);
      setIsRegistered(false);
    } finally {
      setIsRegistering(false);
    }
  };

  if (isRegistered) {
    return null; // We don't need to show this when registered as we show status in the header
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="bg-[#128C7E] text-white p-4">
        <h2 className="text-xl font-semibold">Sign in to your SIP account</h2>
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
          <label htmlFor="sip-uri" className="block text-sm font-medium text-gray-700 mb-1">
            SIP URI
          </label>
          <input
            id="sip-uri"
            type="text"
            value={sipUri}
            onChange={(e) => setSipUri(e.target.value)}
            placeholder="user@domain.com"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
          />
        </div>

        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            Username (optional)
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username for authentication"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
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
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
          />
        </div>

        <div>
          <label htmlFor="ws-server" className="block text-sm font-medium text-gray-700 mb-1">
            WebSocket Server
          </label>
          <input
            id="ws-server"
            type="text"
            value={wsServer}
            onChange={(e) => setWsServer(e.target.value)}
            placeholder="wss://example.com:8089/ws"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
          />
        </div>

        <button
          onClick={handleRegister}
          disabled={isRegistering || !sipUri || !password || !wsServer}
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
