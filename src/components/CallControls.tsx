"use client";
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  hangupCall,
  transferCall,
  muteCall,
  holdCall,
  sendDtmf,
  getCallState,
  isCallOnHold,
  toggleVideo,
  switchCamera,
  debugAudioTracks
} from "../lib/sipClient";

interface CallControlsProps {
  domain: string;
  inCall: boolean;
  currentSession?: any;
}

// Define the type for the methods exposed via ref
export interface CallControlsRef {
  handleVideoToggle: () => void;
  handleCameraSwitch: () => Promise<boolean>;
}

const CallControls = forwardRef<CallControlsRef, CallControlsProps>(({ domain, inCall, currentSession }, ref) => {
  const [transferTarget, setTransferTarget] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [showDtmf, setShowDtmf] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callStatus, setCallStatus] = useState("Connecting");
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [debugResult, setDebugResult] = useState<any>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Expose methods to parent component via ref
  useImperativeHandle(ref, () => ({
    handleVideoToggle: () => {
      const success = toggleVideo(!isVideoEnabled);
      if (success) {
        setIsVideoEnabled(!isVideoEnabled);
      }
      return success;
    },
    handleCameraSwitch: async () => {
      if (isSwitchingCamera) return false;

      setIsSwitchingCamera(true);
      try {
        const success = await switchCamera();
        if (!success) {
          console.error("Failed to switch camera");
        }
        return success;
      } catch (error) {
        console.error("Error switching camera:", error);
        return false;
      } finally {
        setIsSwitchingCamera(false);
      }
    }
  }));

  // Start call duration timer when call is established
  useEffect(() => {
    if (inCall) {
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      // Update call status
      const checkStatus = setInterval(() => {
        const state = getCallState();
        if (state === "Established") {
          setCallStatus("In Call");
        } else if (state === "Terminated") {
          setCallStatus("Ended");
        } else {
          setCallStatus("Connecting");
        }
      }, 500);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
        clearInterval(checkStatus);
        setCallDuration(0);
      };
    }
  }, [inCall]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return [
      hours > 0 ? String(hours).padStart(2, '0') : null,
      String(minutes).padStart(2, '0'),
      String(secs).padStart(2, '0')
    ].filter(Boolean).join(':');
  };

  const handleHangup = () => {
    hangupCall();
  };

  const handleMuteToggle = () => {
    const success = muteCall(!isMuted);
    if (success) {
      setIsMuted(!isMuted);
    }
  };

  const handleHoldToggle = () => {
    const success = holdCall(!isOnHold);
    if (success) {
      setIsOnHold(!isOnHold);
    }
  };

  const handleDtmfTone = (tone: string) => {
    sendDtmf(tone);
  };

  const handleTransfer = () => {
    if (!transferTarget) return;
    const success = transferCall(`sip:${transferTarget}@${domain}`);
    if (!success) {
      console.error("Failed to transfer call");
    }
  };

  const handleVideoToggle = () => {
    const success = toggleVideo(!isVideoEnabled);
    if (success) {
      setIsVideoEnabled(!isVideoEnabled);
    }
  };

  const handleCameraSwitch = async () => {
    if (isSwitchingCamera) return; // Prevent multiple simultaneous switches

    setIsSwitchingCamera(true);
    try {
      const success = await switchCamera();
      if (!success) {
        console.error("Failed to switch camera");
      }
    } catch (error) {
      console.error("Error switching camera:", error);
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  const handleDebugAudio = () => {
    try {
      const result = debugAudioTracks();
      setDebugResult(result);
      setShowDebugInfo(true);

      // Log the result to console for detailed inspection
      console.log('Audio debug result:', result);

      // Show a user-friendly message
      if (result.status === 'success') {
        alert(result.message);
      } else {
        alert(`Audio issue detected: ${result.message}`);
      }
    } catch (error) {
      console.error('Error debugging audio:', error);
      if (error instanceof Error) {
        alert(`Error debugging audio: ${error.message}`);
      } else {
        alert('An unknown error occurred while debugging audio.');
      }
    }
  };

  if (!inCall) return null;

  return (
    <div className="bg-[#f0f2f5] rounded-lg shadow-md overflow-hidden">
      {/* Call Status Header */}
      <div className="bg-[#128C7E] text-white p-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Active Call</h2>
          <div className="flex items-center">
            <div className={`h-3 w-3 rounded-full mr-2 ${
              callStatus === "In Call" ? "bg-green-400" :
              callStatus === "Connecting" ? "bg-yellow-300" : "bg-red-400"
            }`}></div>
            <span className="text-sm font-medium">{callStatus}</span>
          </div>
        </div>
        <div className="text-center mt-2">
          <span className="text-2xl font-medium">{formatDuration(callDuration)}</span>
        </div>
      </div>

      {/* Main Controls */}
      <div className="p-6">
        {/* Primary Call Controls */}
        <div className="flex justify-center space-x-4 mb-8">
          <button
            onClick={handleHangup}
            className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition duration-200"
            title="Hang Up"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
          </button>

          <button
            onClick={handleMuteToggle}
            className={`w-16 h-16 ${isMuted ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-[#128C7E] hover:bg-[#0e6b5e]'} text-white rounded-full flex items-center justify-center transition duration-200`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          <button
            onClick={handleVideoToggle}
            className={`w-16 h-16 ${!isVideoEnabled ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-[#128C7E] hover:bg-[#0e6b5e]'} text-white rounded-full flex items-center justify-center transition duration-200`}
            disabled={isSwitchingCamera}
            title={isVideoEnabled ? 'Disable Video' : 'Enable Video'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
          </button>
        </div>

        {/* Secondary Controls */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={handleHoldToggle}
            className={`flex items-center justify-center ${isOnHold ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-gray-200 hover:bg-gray-300'} text-${isOnHold ? 'white' : 'gray-800'} font-medium py-3 px-4 rounded-md transition duration-200`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {isOnHold ? 'Resume' : 'Hold'}
          </button>

          <button
            onClick={handleCameraSwitch}
            className="flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 px-4 rounded-md transition duration-200"
            disabled={isSwitchingCamera || !isVideoEnabled}
          >
            {isSwitchingCamera ? (
              <span>Switching...</span>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Switch Camera
              </>
            )}
          </button>

          <button
            onClick={handleDebugAudio}
            className="flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-md transition duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM6.293 6.707a1 1 0 011.414-1.414l.7.7a1 1 0 11-1.414 1.414l-.7-.7zM13.707 7.707a1 1 0 01-1.414-1.414l.7-.7a1 1 0 111.414 1.414l-.7.7z" />
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14a6 6 0 110-12 6 6 0 010 12z" />
            </svg>
            Debug Audio
          </button>

          <button
            onClick={() => setShowDtmf(!showDtmf)}
            className="flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 px-4 rounded-md transition duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            {showDtmf ? 'Hide Keypad' : 'Show Keypad'}
          </button>

          <button
            onClick={() => document.getElementById('transfer-section')?.classList.toggle('hidden')}
            className="flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 px-4 rounded-md transition duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
            </svg>
            Transfer
          </button>

          <button
            onClick={() => setShowDebugInfo(!showDebugInfo)}
            className="flex items-center justify-center bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 px-4 rounded-md transition duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {showDebugInfo ? 'Hide Debug Info' : 'Show Debug Info'}
          </button>
        </div>

        {/* Debug Info Section */}
        {showDebugInfo && debugResult && (
          <div className="mb-6 bg-white p-4 rounded-lg">
            <h3 className="font-medium mb-3 text-gray-700">Audio Debug Information</h3>
            <div className="text-sm bg-gray-100 p-3 rounded overflow-auto max-h-60">
              <p><strong>Status:</strong> <span className={debugResult.status === 'success' ? 'text-green-600' : 'text-red-600'}>{debugResult.status}</span></p>
              <p><strong>Message:</strong> {debugResult.message}</p>
              {debugResult.connectionState && (
                <>
                  <p><strong>Connection State:</strong> {debugResult.connectionState}</p>
                  <p><strong>ICE Connection State:</strong> {debugResult.iceConnectionState}</p>
                  <p><strong>Signaling State:</strong> {debugResult.signalingState}</p>
                </>
              )}
              {debugResult.tracks && debugResult.tracks.length > 0 && (
                <>
                  <p className="mt-2 font-medium">Tracks:</p>
                  <ul className="list-disc pl-5">
                    {debugResult.tracks.map((track: any, index: number) => (
                      <li key={index} className={track.fixed ? 'text-green-600' : ''}>
                        {track.noTrack ? (
                          `Sender ${track.index}: No track`
                        ) : (
                          `Track ${track.index}: ${track.kind}, enabled: ${track.enabled}, state: ${track.readyState}, muted: ${track.muted}${track.fixed ? ' (Fixed)' : ''}`
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}

        {/* DTMF Keypad */}
        {showDtmf && (
          <div className="mb-6 bg-white p-4 rounded-lg">
            <h3 className="font-medium mb-3 text-gray-700">DTMF Keypad</h3>
            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                <button
                  key={key}
                  onClick={() => handleDtmfTone(key)}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-3 rounded-md transition duration-200"
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Transfer Call Section */}
        <div id="transfer-section" className="hidden bg-white p-4 rounded-lg mb-4">
          <h3 className="font-medium mb-3 text-gray-700">Transfer Call</h3>
          <div className="flex space-x-2">
            <input
              type="text"
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              placeholder="Enter transfer target"
              className="flex-1 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#128C7E] text-black"
            />
            <button
              onClick={handleTransfer}
              disabled={!transferTarget}
              className="bg-[#128C7E] hover:bg-[#0e6b5e] text-white font-medium py-2 px-4 rounded-md disabled:opacity-50 transition duration-200"
            >
              Transfer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

// Add display name for debugging
CallControls.displayName = 'CallControls';

export default CallControls;
