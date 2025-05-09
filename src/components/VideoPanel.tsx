"use client";
import { useEffect, useRef, useState } from "react";

interface VideoPanelProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onToggleVideo?: () => void;
  onSwitchCamera?: () => void;
  callStatus?: 'connecting' | 'connected' | 'reconnecting' | undefined;
}

export default function VideoPanel({ localStream, remoteStream, onToggleVideo, onSwitchCamera, callStatus = 'connecting' }: VideoPanelProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState<number>(1);
  const [localTrackEnded, setLocalTrackEnded] = useState<boolean>(false);
  const [remoteTrackEnded, setRemoteTrackEnded] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [callDuration, setCallDuration] = useState<number>(0);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-hide controls after 3 seconds of inactivity
  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    // Set up initial timeout
    resetControlsTimeout();

    // Start call duration timer when connected
    if (callStatus === 'connected') {
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }

    // Clean up on unmount
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [callStatus]);

  // Format call duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log("Setting local stream to video element", localStream.getTracks().map(t => t.kind));

      // Check if we have video tracks
      const hasVideoTracks = localStream.getVideoTracks().length > 0;
      console.log("Local stream has video tracks:", hasVideoTracks);

      // Set srcObject and ensure it's applied
      localVideoRef.current.srcObject = localStream;

      // Force a repaint to ensure the video element updates
      localVideoRef.current.style.display = 'none';
      // This triggers a reflow
      void localVideoRef.current.offsetHeight;
      localVideoRef.current.style.display = 'block';

      // Ensure video plays when ready
      localVideoRef.current.onloadedmetadata = () => {
        if (localVideoRef.current) {
          console.log("Local video metadata loaded, attempting to play", {
            videoWidth: localVideoRef.current.videoWidth,
            videoHeight: localVideoRef.current.videoHeight,
            readyState: localVideoRef.current.readyState
          });
          localVideoRef.current.play().catch(e => {
            console.error("Error playing local video:", e);
          });
        }
      };

      // Add more event listeners for debugging
      localVideoRef.current.onloadeddata = () => {
        console.log("Local video data loaded");
      };

      localVideoRef.current.oncanplay = () => {
        console.log("Local video can play");
        // Try playing again when canplay fires
        if (localVideoRef.current) {
          localVideoRef.current.play().catch(e => {
            console.log("Error playing local video on canplay:", e);
          });
        }
      };

      // Try to play immediately as well
      localVideoRef.current.play().catch(e => {
        console.log("Initial play attempt for local video:", e);
        // This is expected if metadata isn't loaded yet
      });

      // Add track ended event listeners
      const tracks = localStream.getTracks();
      tracks.forEach(track => {
        track.onended = () => {
          console.log("Local track ended:", track.kind);
          if (track.kind === 'video') {
            setLocalTrackEnded(true);
          }
        };
      });

      // Reset track ended state when we get a new stream
      setLocalTrackEnded(false);
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log("Setting remote stream to video element", remoteStream.getTracks().map(t => t.kind));

      // Check if we have video tracks
      const hasVideoTracks = remoteStream.getVideoTracks().length > 0;
      console.log("Remote stream has video tracks:", hasVideoTracks);

      // Set srcObject and ensure it's applied
      remoteVideoRef.current.srcObject = remoteStream;

      // Force a repaint to ensure the video element updates
      remoteVideoRef.current.style.display = 'none';
      // This triggers a reflow
      void remoteVideoRef.current.offsetHeight;
      remoteVideoRef.current.style.display = 'block';

      // Set volume
      remoteVideoRef.current.volume = volume;

      // Ensure video plays when ready
      remoteVideoRef.current.onloadedmetadata = () => {
        if (remoteVideoRef.current) {
          console.log("Remote video metadata loaded, attempting to play", {
            videoWidth: remoteVideoRef.current.videoWidth,
            videoHeight: remoteVideoRef.current.videoHeight,
            readyState: remoteVideoRef.current.readyState
          });
          remoteVideoRef.current.play().catch(e => {
            console.error("Error playing remote video:", e);
          });
        }
      };

      // Add more event listeners for debugging
      remoteVideoRef.current.onloadeddata = () => {
        console.log("Remote video data loaded");
      };

      remoteVideoRef.current.oncanplay = () => {
        console.log("Remote video can play");
        // Try playing again when canplay fires
        if (remoteVideoRef.current) {
          remoteVideoRef.current.play().catch(e => {
            console.log("Error playing remote video on canplay:", e);
          });
        }
      };

      // Try to play immediately as well
      remoteVideoRef.current.play().catch(e => {
        console.log("Initial play attempt for remote video:", e);
        // This is expected if metadata isn't loaded yet
      });

      // Add track ended event listeners
      const tracks = remoteStream.getTracks();
      tracks.forEach(track => {
        track.onended = () => {
          console.log("Remote track ended:", track.kind);
          if (track.kind === 'video') {
            setRemoteTrackEnded(true);
          }
        };
      });

      // Reset track ended state when we get a new stream
      setRemoteTrackEnded(false);
    }
  }, [remoteStream, volume]);

  // Debug function to log stream details
  const logStreamDetails = (stream: MediaStream | null, label: string) => {
    if (!stream) {
      console.log(`${label} stream is null`);
      return;
    }

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();

    console.log(`${label} stream details:`, {
      id: stream.id,
      active: stream.active,
      videoTracks: videoTracks.length,
      audioTracks: audioTracks.length
    });

    videoTracks.forEach((track, i) => {
      console.log(`${label} video track ${i}:`, {
        id: track.id,
        enabled: track.enabled,
        readyState: track.readyState,
        muted: track.muted,
        contentHint: track.contentHint,
        settings: track.getSettings()
      });
    });
  };

  // Log stream details whenever they change
  useEffect(() => {
    logStreamDetails(localStream, 'Local');
  }, [localStream]);

  useEffect(() => {
    logStreamDetails(remoteStream, 'Remote');
  }, [remoteStream]);

  // Periodically check if videos are playing and restart if needed
  useEffect(() => {
    const checkVideoPlayback = () => {
      // Check local video
      if (localVideoRef.current && localStream && localStream.getVideoTracks().length > 0) {
        const localVideo = localVideoRef.current;

        // If video has valid dimensions but is paused, try to play it
        if (localVideo.videoWidth > 0 && localVideo.videoHeight > 0 && localVideo.paused) {
          console.log("Local video has dimensions but is paused, attempting to play again");
          localVideo.play().catch(e => {
            console.log("Error restarting local video:", e);
          });
        }

        // Log if video appears to be stuck
        if (localVideo.readyState >= 3 && localVideo.paused) {
          console.log("Local video is ready but paused");
        }
      }

      // Check remote video
      if (remoteVideoRef.current && remoteStream && remoteStream.getVideoTracks().length > 0) {
        const remoteVideo = remoteVideoRef.current;

        // If video has valid dimensions but is paused, try to play it
        if (remoteVideo.videoWidth > 0 && remoteVideo.videoHeight > 0 && remoteVideo.paused) {
          console.log("Remote video has dimensions but is paused, attempting to play again");
          remoteVideo.play().catch(e => {
            console.log("Error restarting remote video:", e);
          });
        }

        // Log if video appears to be stuck
        if (remoteVideo.readyState >= 3 && remoteVideo.paused) {
          console.log("Remote video is ready but paused");
        }
      }
    };

    // Check every 2 seconds
    const intervalId = setInterval(checkVideoPlayback, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [localStream, remoteStream]);

  console.log("Rendering VideoPanel", localStream, remoteStream, showControls);

  return (
    <div
      className="relative w-full h-full bg-gradient-to-b from-gray-900 to-black overflow-hidden"
      onMouseMove={resetControlsTimeout}
      onClick={() => setShowControls(!showControls)}
    >
      {/* Call Status and Duration */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black to-transparent p-4">
        <div className="flex flex-col items-center text-white">
          <div className="flex items-center space-x-2 mb-2">
            {callStatus === 'connecting' && (
              <>
                <div className="animate-pulse flex items-center">
                  <div className="h-2.5 w-2.5 bg-yellow-400 rounded-full mr-1.5"></div>
                  <div className="h-2.5 w-2.5 bg-yellow-400 rounded-full mr-1.5"></div>
                  <div className="h-2.5 w-2.5 bg-yellow-400 rounded-full"></div>
                </div>
                <span className="text-sm font-medium">Connecting...</span>
              </>
            )}
            {callStatus === 'connected' && (
              <>
                <div className="h-2.5 w-2.5 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">Connected</span>
              </>
            )}
            {callStatus === 'reconnecting' && (
              <>
                <div className="animate-pulse flex items-center">
                  <div className="h-2.5 w-2.5 bg-red-500 rounded-full mr-1.5"></div>
                  <div className="h-2.5 w-2.5 bg-red-500 rounded-full mr-1.5"></div>
                  <div className="h-2.5 w-2.5 bg-red-500 rounded-full"></div>
                </div>
                <span className="text-sm font-medium">Reconnecting...</span>
              </>
            )}
          </div>
          {callStatus === 'connected' && (
            <div className="bg-black bg-opacity-40 px-4 py-1.5 rounded-full">
              <div className="text-sm font-medium flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                {formatDuration(callDuration)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Remote Video (Full Screen) */}
      <div className="absolute inset-0 w-full h-full">
        {remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={false}
            controls={false}
            className="w-full h-full object-cover"
            style={{ minHeight: '100%', minWidth: '100%' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-white">
              <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="animate-pulse">
                <p className="text-xl font-medium mb-2">Waiting for video...</p>
                <p className="text-sm text-gray-300">The remote user's camera is being set up</p>
              </div>
            </div>
          </div>
        )}

        {remoteTrackEnded && (
          <div className="absolute top-4 left-0 right-0 flex justify-center">
            <div className="bg-red-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg">
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Remote video ended
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Local Video (Picture-in-Picture) */}
      <div className="absolute top-4 right-4 w-1/3 max-w-[180px] aspect-video rounded-lg overflow-hidden shadow-lg border-2 border-white transition-all duration-300 hover:scale-105">
        {localStream ? (
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            controls={false}
            className="w-full h-full object-cover"
            style={{ minHeight: '100%', minWidth: '100%' }}
          />
        ) : (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </div>
        )}

        {localTrackEnded && (
          <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
            <div className="text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white mx-auto mb-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
              </svg>
              <span className="text-white text-xs font-medium">Camera off</span>
            </div>
          </div>
        )}

        <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1.5 py-0.5 rounded">
          You
        </div>
      </div>

      {/* Connection Quality Indicator */}
      {callStatus === 'connected' && (
        <div className="absolute top-4 left-4 bg-black bg-opacity-50 rounded-full p-2">
          <div className="flex space-x-0.5">
            <div className="h-3 w-1 bg-green-500 rounded-sm"></div>
            <div className="h-4 w-1 bg-green-500 rounded-sm"></div>
            <div className="h-5 w-1 bg-green-500 rounded-sm"></div>
            <div className="h-6 w-1 bg-green-500 rounded-sm"></div>
          </div>
        </div>
      )}

      {/* Controls Overlay - shows/hides on interaction */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Volume Control */}
        <div className="flex items-center mb-8 px-4 bg-black bg-opacity-30 py-3 rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white mr-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-white text-sm ml-3">{Math.round(volume * 100)}%</span>
        </div>

        {/* Main Controls */}
        <div className="flex justify-center space-x-8">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleVideo && onToggleVideo();
            }}
            className="w-16 h-16 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-full flex flex-col items-center justify-center transition duration-200 shadow-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 mb-1" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
            <span className="text-xs">Camera</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onSwitchCamera && onSwitchCamera();
            }}
            className={`w-16 h-16 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-full flex flex-col items-center justify-center transition duration-200 shadow-lg ${!localStream ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!localStream}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 mb-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            <span className="text-xs">Switch</span>
          </button>
        </div>
      </div>
    </div>
  );
}
