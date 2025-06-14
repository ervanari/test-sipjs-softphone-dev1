"use client";
import { useEffect, useRef, useState } from "react";
import { acceptCall, hangupCall } from "../lib/sipClient";

interface IncomingCallProps {
  invitation: any;
  onAccept: () => void;
  onReject?: () => void;
  onHide?: () => void;
}

// Function to check if the invitation includes video
const hasVideo = (invitation: any): boolean => {
  try {
    // Check if the invitation has a request with an SDP body
    if (invitation?.request?.body) {
      const sdp = invitation.request.body;
      // Check if the SDP contains a video media section
      return sdp.includes('m=video');
    }
  } catch (error) {
    console.error("Error checking for video in invitation:", error);
  }
  // Default to false if we can't determine
  return false;
};

export default function IncomingCall({ invitation, onAccept, onReject, onHide }: IncomingCallProps) {
  console.log("IncomingCall component rendered", invitation);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlayError, setAudioPlayError] = useState(false);
  const isVideoCall = hasVideo(invitation);

  // Function to play ringtone that can be called after user interaction
  const playRingtone = () => {
    if (audioRef.current) {
      audioRef.current.play()
        .then(() => {
          setAudioPlayError(false);
        })
        .catch(err => {
          console.error("Failed to play ringtone:", err);
          setAudioPlayError(true);
        });
    }
  };

  useEffect(() => {
    // Create audio element for ringtone
    try {
      audioRef.current = new Audio('/ringing.wav');
      audioRef.current.loop = true;

      // Try to play, but it might fail due to browser autoplay policy
      playRingtone();

      // Cleanup function
      return () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      };
    } catch (err) {
      console.error("Failed to create audio for ringtone:", err);
      setAudioPlayError(true);
    }
  }, []);

  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  const handleAccept = async (withVideo: boolean) => {
    if (!invitation) return;

    setIsAccepting(true);
    setAcceptError(null);

    // Stop ringtone
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    try {
      // Accept the call
      await acceptCall(invitation, withVideo);

      // Notify parent component
      onAccept();
    } catch (error) {
      console.error("Failed to accept call:", error);
      setAcceptError(error instanceof Error ? error.message : "Failed to accept call");
      setIsAccepting(false);
    }
  };

  const handleReject = () => {
    if (!invitation) return;

    // Stop ringtone
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Reject the call
    hangupCall();

    // Notify parent component if callback exists
    if (onReject) {
      onReject();
    }
  };

  const handleHide = () => {
    // Stop ringtone
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Notify parent component if callback exists
    if (onHide) {
      onHide();
    }
  };

  // Extract username from SIP URI for display
  const callerUri = invitation?.remoteIdentity?.uri?.toString() || "Unknown";
  const callerName = callerUri.includes('@')
    ? callerUri.split(':')[1]?.split('@')[0] || callerUri
    : callerUri;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50">
      <div className="max-w-md w-full relative">
        {/* Caller Info */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-[#128C7E] rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">{callerName}</h2>
          <p className="text-gray-300 mt-2">
            {isAccepting ? "Connecting..." : "Incoming call..."}
          </p>

          {/* Error message */}
          {acceptError && (
            <div className="mt-4 p-3 bg-red-500 bg-opacity-70 rounded-md text-white text-sm">
              {acceptError}
            </div>
          )}
        </div>

        {/* Call Actions */}
        <div className="flex justify-center space-x-8 mb-6">
          {/* Reject Button */}
          <button
            onClick={handleReject}
            className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition duration-200 transform hover:scale-105"
            aria-label="Reject call"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Conditionally render either Audio or Video Accept Button based on call type */}
          {isVideoCall ? (
            /* Accept Video Button */
            <button
              onClick={() => handleAccept(true)}
              className="w-16 h-16 bg-[#128C7E] hover:bg-[#0e6b5e] text-white rounded-full flex items-center justify-center transition duration-200 transform hover:scale-105"
              aria-label="Accept video call"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </button>
          ) : (
            /* Accept Audio Button */
            <button
              onClick={() => handleAccept(false)}
              className="w-16 h-16 bg-[#25D366] hover:bg-[#1faa52] text-white rounded-full flex items-center justify-center transition duration-200 transform hover:scale-105"
              aria-label="Accept audio call"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
            </button>
          )}
        </div>

        {/* Call Type Labels */}
        <div className="flex justify-center space-x-8 text-center">
          <div className="w-16 text-red-400 text-sm font-medium">
            Decline
          </div>
          {isVideoCall ? (
            <div className="w-16 text-[#128C7E] text-sm font-medium">
              Video
            </div>
          ) : (
            <div className="w-16 text-green-400 text-sm font-medium">
              Audio
            </div>
          )}
        </div>

        {/* Swipe instruction */}
        <div className="text-center mt-8 text-gray-400 text-sm">
          Tap a button to respond
        </div>

        {/* Sound enable button - only shown if audio playback failed */}
        {audioPlayError && (
          <div className="mt-4 text-center">
            <button
              onClick={playRingtone}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition duration-200"
            >
              Enable Ringtone
            </button>
            <p className="mt-2 text-xs text-gray-400">
              Browser blocked automatic sound playback. Click to enable ringtone.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
