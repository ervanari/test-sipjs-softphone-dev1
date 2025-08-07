'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { initSIP, unregisterSIP, ua, currentSession } from '@/lib/sipClient';
import IncomingCall from './IncomingCall';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import useSipStore from '@/lib/store/useSipStore';

// Define the context type
interface SIPContextType {
  isRegistered: boolean;
  domain: string;
  username: string;
}

// Create the context with a default value
const SIPContext = createContext<SIPContextType>({
  isRegistered: false,
  domain: '',
  username: '',
});

// Hook to use the SIP context
export const useSIP = () => useContext(SIPContext);

interface SIPProviderProps {
  children: ReactNode;
}

export default function SIPProvider({ children }: SIPProviderProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [isRegistered, setIsRegistered] = useState(false);
  const [domain, setDomain] = useState('');
  const [username, setUsername] = useState('');
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Get Zustand store actions
  const {
    setCurrentSession,
    setUserAgent,
    setIsIncomingCall,
    setCallState
  } = useSipStore();

  // Handle incoming call
  const handleIncomingCall = (invitation: any) => {
    console.log('Incoming call received:', invitation);
    setIncomingCall(invitation);
    setIsIncomingCall(true);
    setCallState('ringing');
    // Store the session in Zustand store
    setCurrentSession(invitation);
  };

  // Handle call rejection
  const handleCallRejected = () => {
    setIncomingCall(null);
    setIsIncomingCall(false);
    setCallState('idle');
  };

  // Handle hiding incoming call without accepting/rejecting
  const handleCallHidden = () => {
    setIncomingCall(null);
  };

  // Handle call acceptance
  const handleCallAccepted = () => {
    // The session is already stored in the Zustand store
    // Just clear the local state and navigate to the call page
    setIncomingCall(null);
    setCallState('establishing');
    
    // Use Next.js router for navigation instead of window.location
    // This preserves the JavaScript state across page navigations
    router.push('/call');
  };

  // Load SIP configuration and register
  useEffect(() => {
    async function loadAndRegisterSIP() {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        // Check if SIP data is already in localStorage (meaning the user has already registered)
        const savedSipData = localStorage.getItem('sipData');
        let sipConfig;
        
        if (savedSipData) {
          try {
            // Parse the stored credentials
            const data = JSON.parse(savedSipData);
            
            if (data.username && data.password && data.wsServer && data.domain) {
              console.log('Found existing SIP configuration in localStorage');
              sipConfig = {
                username: data.username,
                password: data.password,
                wsServer: data.wsServer,
                domain: data.domain
              };
              
              // Update state with saved info
              setDomain(data.domain);
              setUsername(data.username);
              setIsRegistered(true);
              setIsLoading(false);
              
              // Set up the onInvite handler for the existing SIP client
              // This ensures that incoming calls are handled by this component
              // even if the SIP client was initialized elsewhere
              const { ua } = await import('@/lib/sipClient');
              if (ua) {
                console.log('SIP client already initialized, setting up onInvite handler');
                if (ua.delegate) {
                  const originalOnInvite = ua.delegate.onInvite;
                  ua.delegate.onInvite = (invitation: any) => {
                    // Call the original onInvite if it exists
                    if (originalOnInvite) {
                      originalOnInvite(invitation);
                    }
                    // Also handle the invitation in this component
                    handleIncomingCall(invitation);
                  };
                }
                return;
              }
            }
          } catch (error) {
            console.error('Error parsing saved SIP data:', error);
          }
        }
        
        // If no valid saved data, fetch from API
        if (!sipConfig) {
          const response = await fetch(`/api/user-config?userId=${user.id}`);
          
          if (!response.ok) {
            console.log('No SIP configuration found for user');
            setIsLoading(false);
            return;
          }
          
          const result = await response.json();
          if (!result.data) {
            console.log('No SIP configuration data found');
            setIsLoading(false);
            return;
          }
          
          const config = result.data;
          sipConfig = {
            username: config.sipUsername,
            password: config.sipPassword,
            server: config.sipServer,
            domain: config.sipDomain,
            port: config.sipPort || 443,
            useWebSocket: config.useWebSocket
          };
        }
        
        // Construct SIP URI and WebSocket URL
        const sipUri = `sip:${sipConfig.username}@${sipConfig.domain}`;
        let wsServer = sipConfig.wsServer || sipConfig.server;
        
        console.log('SIP configuration:', sipConfig);
        // Ensure WebSocket URL has the correct format
        if (sipConfig.useWebSocket !== false) {
          if (!wsServer.startsWith('wss://') && !wsServer.startsWith('ws://')) {
            wsServer = `wss://${wsServer}`;
          }

          // Add port if not included in the URL
          if (!wsServer.includes(':')) {
            wsServer = `${wsServer}:${sipConfig.port || 443}`;
          }

          // Add /ws path if not included
          if (!wsServer.includes('/ws')) {
            wsServer = `${wsServer}/ws`;
          }
        }
        
        console.log('Registering SIP with URI:', sipUri, 'and WebSocket server:', wsServer);
        
        // Initialize SIP client
        await initSIP({
          uri: sipUri,
          password: sipConfig.password,
          wsServer: wsServer,
          onInvite: handleIncomingCall,
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        });
        
        // Store the user agent in the Zustand store
        if (ua) {
          console.log('Storing user agent in Zustand store');
          setUserAgent(ua);
          
          // If there's an active session, store it too
          if (currentSession) {
            console.log('Storing current session in Zustand store');
            setCurrentSession(currentSession);
          }
        }
        
        // Update state with registration info
        setIsRegistered(true);
        setDomain(sipConfig.domain);
        setUsername(sipConfig.username);
        console.log('SIP registration successful');
      } catch (error) {
        console.error('Error registering SIP:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadAndRegisterSIP();
    
    // Cleanup on unmount
    return () => {
      if (isRegistered) {
        unregisterSIP().catch(error => {
          console.error('Error unregistering SIP:', error);
        });
      }
    };
  }, [user]);

  // Provide the SIP context value
  const contextValue: SIPContextType = {
    isRegistered,
    domain,
    username,
  };

  return (
    <SIPContext.Provider value={contextValue}>
      {children}
      
      {/* Render the IncomingCall component when there's an incoming call */}
      {incomingCall && (
        <IncomingCall
          invitation={incomingCall}
          userId={user?.id}
          onAccept={handleCallAccepted}
          onReject={handleCallRejected}
          onHide={handleCallHidden}
        />
      )}
    </SIPContext.Provider>
  );
}
