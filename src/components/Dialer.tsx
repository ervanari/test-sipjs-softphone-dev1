"use client";
import { useState } from "react";
import { makeCall } from "../lib/sipClient";

interface DialerProps {
  domain: string;
  onCallInitiated?: (session: any) => void;
}

export default function Dialer({ domain, onCallInitiated }: DialerProps) {
  const [target, setTarget] = useState("");
  const [isVideo, setIsVideo] = useState(false);
  const [isCallInProgress, setIsCallInProgress] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const handleCall = async () => {
    if (!target) return;

    setIsCallInProgress(true);
    setCallError(null);

    try {
      const session = await makeCall(`sip:${target}@${domain}`, isVideo);
      if (onCallInitiated && session) {
        onCallInitiated(session);
      }
      console.log("Call initiated to:", target);
      return session;
    } catch (error) {
      console.error("Failed to make call:", error);
      setCallError(error instanceof Error ? error.message : "Failed to make call");
      return null;
    } finally {
      setIsCallInProgress(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="bg-[#128C7E] text-white p-4">
        <h2 className="text-xl font-semibold">New Call</h2>
      </div>

      <div className="p-6">
        <div className="mb-6">
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Enter SIP address or phone number"
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#128C7E]"
            disabled={isCallInProgress}
          />

          {/* Error message */}
          {callError && (
            <div className="mt-2 p-2 bg-red-100 border-l-4 border-red-500 text-red-700 text-sm">
              {callError}
            </div>
          )}
        </div>

        <div className="flex items-center mb-6">
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                id="video-call"
                checked={isVideo}
                onChange={(e) => setIsVideo(e.target.checked)}
                className="sr-only"
              />
              <div className={`block w-14 h-8 rounded-full transition ${isVideo ? 'bg-[#25D366]' : 'bg-gray-300'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition transform ${isVideo ? 'translate-x-6' : ''}`}></div>
            </div>
            <span className="ml-3 text-gray-700 font-medium">Video Call</span>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, "*", 0, "#"].map((digit) => (
            <button
              key={digit}
              onClick={() => setTarget(prev => prev + digit)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-4 rounded-full transition duration-200"
            >
              {digit}
            </button>
          ))}
        </div>

        <div className="flex justify-between space-x-4">
          <button
            onClick={() => setTarget("")}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 px-4 rounded-md transition duration-200"
          >
            Clear
          </button>
          <button
            onClick={handleCall}
            disabled={!target || isCallInProgress}
            className="flex-1 flex justify-center items-center bg-[#128C7E] hover:bg-[#0e6b5e] text-white font-medium py-3 px-4 rounded-md disabled:opacity-50 transition duration-200"
          >
            {isCallInProgress ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Calling...
              </>
            ) : isVideo ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  <path d="M14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                </svg>
                Video Call
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
                Audio Call
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
