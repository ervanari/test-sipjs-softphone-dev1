'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import Dialer from '@/components/Dialer';
import CallControls from '@/components/CallControls';
import VideoPanel from '@/components/VideoPanel';
import Link from 'next/link';

export default function CallPage() {
  const { user } = useAuth();
  
  // Call state
  const [inCall, setInCall] = useState(false);
  const [currentSession, setCurrentSession] = useState(null);
  const [callStatus, setCallStatus] = useState();
  
  // Media streams
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  
  // Refs for component methods
  const callControlsRef = useRef(null);

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

  const handleCallInitiated = (session) => {
    setCurrentSession(session);
    setInCall(true);
    setCallStatus('connecting');
    console.log('Call initiated with session:', session);
    
    // Listen for call establishment to get media streams
    if (session && session.stateChange) {
      session.stateChange.addListener((state) => {
        if (state === "Established" && session.sessionDescriptionHandler && session.sessionDescriptionHandler.peerConnection) {
          const pc = session.sessionDescriptionHandler.peerConnection;
          
          // Get local stream
          const localMediaStream = new MediaStream();
          pc.getSenders().forEach((s) => {
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
          pc.getReceivers().forEach((r) => {
            if (r.track) {
              console.log(`Adding existing track: ${r.track.kind}, enabled: ${r.track.enabled}, readyState: ${r.track.readyState}`);
              // Ensure track is enabled
              r.track.enabled = true;
              remoteMediaStream.addTrack(r.track);
            }
          });
          
          console.log(`Initial remote stream created with ${remoteMediaStream.getTracks().length} tracks`);
          
          // Listen for track events to handle tracks that arrive later
          pc.addEventListener('track', (event) => {
            console.log('Track event received:', event.track.kind, 'enabled:', event.track.enabled, 'readyState:', event.track.readyState);
            
            if (event.streams && event.streams.length > 0) {
              event.streams[0].getTracks().forEach((track) => {
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

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full">
          <h1 className="text-xl font-bold text-[#128C7E] mb-4">Authentication Required</h1>
          <p className="text-gray-600 mb-4">Please log in to access the dialer.</p>
          <Link href="/" className="bg-[#128C7E] text-white py-2 px-4 rounded font-medium hover:bg-[#0c6b5f] focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:ring-opacity-50">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#128C7E]">Call</h1>
        <p className="text-gray-600">Make a call using your SIP account</p>
      </div>

      {inCall ? (
        <div className="grid grid-cols-1 gap-6">
          {/* Video Panel */}
          <div className="bg-black rounded-lg overflow-hidden" style={{ height: '60vh' }}>
            <VideoPanel
              localStream={localStream}
              remoteStream={remoteStream}
              onToggleVideo={handleVideoToggle}
              onSwitchCamera={handleCameraSwitch}
              callStatus={callStatus}
            />
          </div>
          
          {/* Call Controls */}
          <div className="bg-white p-4 rounded-lg shadow-md">
            <CallControls
              domain="sip.example.com"
              inCall={inCall}
              currentSession={currentSession}
              ref={callControlsRef}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Dialer
              domain="sip.example.com"
              userId={user.id}
              onCallInitiated={handleCallInitiated}
            />
          </div>
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Call Instructions</h2>
            <div className="space-y-3 text-gray-600">
              <p>1. Enter a SIP address or phone number in the dialer.</p>
              <p>2. Toggle the video switch if you want to make a video call.</p>
              <p>3. Click the call button to initiate the call.</p>
              <p>4. Use the keypad to enter DTMF tones during the call if needed.</p>
            </div>
            
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="font-medium text-gray-800 mb-2">Need to configure your SIP account?</h3>
              <Link
                href="/user-config"
                className="text-[#128C7E] hover:text-[#0c6b5f] font-medium flex items-center"
              >
                <span>Go to Settings</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
