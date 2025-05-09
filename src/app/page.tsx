"use client";
import { useEffect, useState, useRef } from "react";
import SIPRegistration from "../components/SIPRegistration";
import Dialer from "../components/Dialer";
import CallControls from "../components/CallControls";
import VideoPanel from "../components/VideoPanel";
import Messaging from "../components/Messaging";
import IncomingCall from "../components/IncomingCall";

export default function Home() {
  // SIP registration state
  const [isRegistered, setIsRegistered] = useState(false);
  const [domain, setDomain] = useState("");

  // Call state
  const [incomingCall, setIncomingCall] = useState<any>(null);
  const [inCall, setInCall] = useState(false);
  const [currentSession, setCurrentSession] = useState<any>(null);

  // Media streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<'chats' | 'calls'>('chats');
  const [showDialer, setShowDialer] = useState(false);
  const [callStatus, setCallStatus] = useState<'connecting' | 'connected' | 'reconnecting'>();

  // Refs for component methods
  const messagingRef = useRef<any>(null);
  const callControlsRef = useRef<any>(null);

  // Handle successful registration
  const handleRegistered = (domainName: string) => {
    setIsRegistered(true);
    setDomain(domainName);
  };

  // Handle incoming call
  const handleIncomingCall = (invitation: any) => {
    setIncomingCall(invitation);
  };

  // Handle received message
  const handleMessageReceived = (message: string, from: string) => {
    // Extract username from SIP URI
    const fromUser = from.split(':')[1]?.split('@')[0] || from;

    // Add to message history in Messaging component
    if (messagingRef.current) {
      messagingRef.current.addReceivedMessage(fromUser, message);
    }
  };

  // Handle call acceptance
  const handleCallAccepted = () => {
    setInCall(true);
    setIncomingCall(null);
    setCurrentSession(incomingCall);
    setActiveTab('calls');
    setCallStatus('connecting');

    // Add state change listener to handle call termination
    if (incomingCall && incomingCall.stateChange) {
      incomingCall.stateChange.addListener((state: string) => {
        console.log(`Incoming call state changed to: ${state}`);
        if (state === "Terminated") {
          // Call ended
          setInCall(false);
          setLocalStream(null);
          setRemoteStream(null);
          setCallStatus(undefined);
        }
      });
    } else {
      console.error("Cannot add state change listener: incomingCall.stateChange is undefined");
    }

    // Get media streams
    if (incomingCall && incomingCall.sessionDescriptionHandler && incomingCall.sessionDescriptionHandler.peerConnection) {
      const pc = incomingCall.sessionDescriptionHandler.peerConnection;

      // Get local stream
      const localMediaStream = new MediaStream();
      pc.getSenders().forEach((s: RTCRtpSender) => {
        if (s.track) {
          console.log(`Adding local track from incoming call: ${s.track.kind}, enabled: ${s.track.enabled}, readyState: ${s.track.readyState}`);
          // Ensure track is enabled
          s.track.enabled = true;
          localMediaStream.addTrack(s.track);
        }
      });
      console.log(`Local stream created with ${localMediaStream.getTracks().length} tracks`);
      setLocalStream(localMediaStream);

      // Get remote stream
      const remoteMediaStream = new MediaStream();

      // Add existing tracks
      pc.getReceivers().forEach((r: RTCRtpReceiver) => {
        if (r.track) {
          console.log(`Adding existing track from incoming call: ${r.track.kind}, enabled: ${r.track.enabled}, readyState: ${r.track.readyState}`);
          // Ensure track is enabled
          r.track.enabled = true;
          remoteMediaStream.addTrack(r.track);
        }
      });

      console.log(`Initial remote stream created with ${remoteMediaStream.getTracks().length} tracks`);

      // Listen for track events to handle tracks that arrive later
      pc.addEventListener('track', (event: RTCTrackEvent) => {
        console.log('Track event received from incoming call:', event.track.kind, 'enabled:', event.track.enabled, 'readyState:', event.track.readyState);

        if (event.streams && event.streams.length > 0) {
          event.streams[0].getTracks().forEach((track: MediaStreamTrack) => {
            console.log(`Adding new track from incoming call: ${track.kind}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
            // Ensure track is enabled
            track.enabled = true;
            remoteMediaStream.addTrack(track);
          });
        } else {
          // If no streams in the event, add the track directly
          console.log(`Adding track directly from incoming call: ${event.track.kind}`);
          event.track.enabled = true;
          remoteMediaStream.addTrack(event.track);
        }

        // Create a new MediaStream to trigger a re-render
        const updatedStream = new MediaStream(remoteMediaStream.getTracks());
        console.log(`Updated remote stream with ${updatedStream.getTracks().length} tracks`);
        setRemoteStream(updatedStream);
        setCallStatus('connected');
      });

      // Set initial remote stream if it has tracks
      if (remoteMediaStream.getTracks().length > 0) {
        setRemoteStream(remoteMediaStream);
      }

      // Set call as connected after a short delay if we already have remote tracks
      if (remoteMediaStream.getTracks().length > 0) {
        setTimeout(() => setCallStatus('connected'), 1000);
      }
    } else {
      console.error("Cannot access media: incomingCall.sessionDescriptionHandler or peerConnection is undefined");
      // Set a timeout to end the call if we can't access media
      setTimeout(() => {
        if (inCall) {
          setInCall(false);
          setLocalStream(null);
          setRemoteStream(null);
          setCallStatus(undefined);
        }
      }, 30000); // 30 seconds timeout
    }
  };

  // Handle video toggle
  const handleVideoToggle = () => {
    if (callControlsRef.current) {
      callControlsRef.current.handleVideoToggle();
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  // Handle camera switch
  const handleCameraSwitch = async () => {
    if (callControlsRef.current && !isSwitchingCamera) {
      setIsSwitchingCamera(true);
      try {
        await callControlsRef.current.handleCameraSwitch();
      } finally {
        setIsSwitchingCamera(false);
      }
    }
  };

  // Handle outgoing call
  const handleOutgoingCall = async (session: any) => {
    setInCall(true);
    setCurrentSession(session);
    setShowDialer(false);
    setActiveTab('calls');
    setCallStatus('connecting');

    // Listen for call establishment to get media streams
    if (session && session.stateChange) {
      session.stateChange.addListener((state: string) => {
        if (state === "Established" && session.sessionDescriptionHandler && session.sessionDescriptionHandler.peerConnection) {
          const pc = session.sessionDescriptionHandler.peerConnection;

          // Get local stream
          const localMediaStream = new MediaStream();
          pc.getSenders().forEach((s: any) => {
            if (s.track) {
              console.log(`Adding local track from outgoing call: ${s.track.kind}, enabled: ${s.track.enabled}, readyState: ${s.track.readyState}`);
              // Ensure track is enabled
              s.track.enabled = true;
              localMediaStream.addTrack(s.track);
            }
          });
          console.log(`Local stream created with ${localMediaStream.getTracks().length} tracks`);
          setLocalStream(localMediaStream);

          // Get remote stream
          const remoteMediaStream = new MediaStream();

          // Add existing tracks
          pc.getReceivers().forEach((r: any) => {
            if (r.track) {
              console.log(`Adding existing track: ${r.track.kind}, enabled: ${r.track.enabled}, readyState: ${r.track.readyState}`);
              // Ensure track is enabled
              r.track.enabled = true;
              remoteMediaStream.addTrack(r.track);
            }
          });

          console.log(`Initial remote stream created with ${remoteMediaStream.getTracks().length} tracks`);

          // Listen for track events to handle tracks that arrive later
          pc.addEventListener('track', (event: any) => {
            console.log('Track event received:', event.track.kind, 'enabled:', event.track.enabled, 'readyState:', event.track.readyState);

            if (event.streams && event.streams.length > 0) {
              event.streams[0].getTracks().forEach((track: MediaStreamTrack) => {
                console.log(`Adding new track: ${track.kind}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
                // Ensure track is enabled
                track.enabled = true;
                remoteMediaStream.addTrack(track);
              });
            } else {
              // If no streams in the event, add the track directly
              console.log(`Adding track directly: ${event.track.kind}`);
              event.track.enabled = true;
              remoteMediaStream.addTrack(event.track);
            }

            // Create a new MediaStream to trigger a re-render
            const updatedStream = new MediaStream(remoteMediaStream.getTracks());
            console.log(`Updated remote stream with ${updatedStream.getTracks().length} tracks`);
            setRemoteStream(updatedStream);
            setCallStatus('connected');
          });

          // Set initial remote stream if it has tracks
          if (remoteMediaStream.getTracks().length > 0) {
            setRemoteStream(remoteMediaStream);
          }

          // Set call as connected after a short delay if we already have remote tracks
          if (remoteMediaStream.getTracks().length > 0) {
            setTimeout(() => {
              setCallStatus('connected');

              // Force a refresh of the streams after a delay to ensure they're properly displayed
              setTimeout(() => {
                if (localMediaStream.getTracks().length > 0) {
                  setLocalStream(new MediaStream(localMediaStream.getTracks()));
                }
                if (remoteMediaStream.getTracks().length > 0) {
                  setRemoteStream(new MediaStream(remoteMediaStream.getTracks()));
                }
              }, 1000);
            }, 1000);
          }
        } else if (state === "Terminated") {
          // Call ended
          setInCall(false);
          setLocalStream(null);
          setRemoteStream(null);
          setCallStatus(undefined);
        }
    });
    } else {
      console.error("Cannot add state change listener: session.stateChange is undefined");
      // Set a timeout to end the call if we can't monitor its state
      setTimeout(() => {
        if (inCall) {
          setInCall(false);
          setLocalStream(null);
          setRemoteStream(null);
          setCallStatus(undefined);
        }
      }, 30000); // 30 seconds timeout
    }
  };

  if (!isRegistered) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[#128C7E]">WebRTC Softphone</h1>
            <p className="text-gray-600">Connect to your SIP account to start messaging and calling</p>
          </div>
          <SIPRegistration
            onRegistered={handleRegistered}
            onIncomingCall={handleIncomingCall}
            onMessageReceived={handleMessageReceived}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col">
      {/* Header */}
      <header className="bg-[#128C7E] text-white p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">WebRTC Softphone</h1>
          <div className="text-sm">
            <span className="inline-flex items-center">
              <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
              Connected as {domain}
            </span>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-[#128C7E] text-white">
        <div className="flex">
          <button
            className={`flex-1 py-3 text-center font-medium ${activeTab === 'chats' ? 'border-b-2 border-white' : 'opacity-80'}`}
            onClick={() => setActiveTab('chats')}
          >
            CHATS
          </button>
          <button
            className={`flex-1 py-3 text-center font-medium ${activeTab === 'calls' ? 'border-b-2 border-white' : 'opacity-80'}`}
            onClick={() => setActiveTab('calls')}
          >
            CALLS
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {/* Chats Tab */}
        {activeTab === 'chats' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-4">
              <Messaging
                domain={domain}
                ref={messagingRef}
              />
            </div>
          </div>
        )}

        {/* Calls Tab */}
        {activeTab === 'calls' && (
          <div className="h-full flex flex-col">
            {inCall ? (
              <div className="flex-1 flex flex-col">
                {/* Video Panel */}
                <div className="flex-1 bg-black">
                  <VideoPanel
                    localStream={localStream}
                    remoteStream={remoteStream}
                    onToggleVideo={handleVideoToggle}
                    onSwitchCamera={handleCameraSwitch}
                    callStatus={callStatus}
                  />
                </div>

                {/* Call Controls */}
                <div className="bg-white p-4">
                  <CallControls
                    domain={domain}
                    inCall={inCall}
                    currentSession={currentSession}
                    ref={callControlsRef}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-4">
                {showDialer ? (
                  <div className="w-full max-w-md">
                    <Dialer domain={domain} onCallInitiated={handleOutgoingCall} />
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-gray-600 mb-4">No active calls</p>
                    <button
                      onClick={() => setShowDialer(true)}
                      className="bg-[#128C7E] text-white px-6 py-3 rounded-full font-medium"
                    >
                      Start a new call
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      {activeTab === 'chats' && (
        <button
          className="fixed bottom-6 right-6 w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg"
          onClick={() => {
            setActiveTab('calls');
            setShowDialer(true);
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </button>
      )}

      {/* Incoming Call Modal */}
      {incomingCall && (
        <IncomingCall
          invitation={incomingCall}
          onAccept={handleCallAccepted}
        />
      )}
    </div>
  );
}
