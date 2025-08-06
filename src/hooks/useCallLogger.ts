import { useEffect, useRef, useCallback } from 'react';
import { Session, Invitation, Inviter } from 'sip.js';
import { recordCallStart } from '../lib/callRecorder';

/**
 * Custom hook for logging SIP calls to the database
 *
 * This hook integrates with the SIP.js client and callRecorder module to
 * automatically log all incoming and outgoing calls to the database.
 *
 * @param userId The ID of the user making/receiving calls
 * @returns An object with methods for logging calls
 */
export function useCallLogger(userId?: string) {
  // Use refs to store state that persists across renders but doesn't trigger re-renders
  const activeCallsRef = useRef<Map<string, () => Promise<void>>>(new Map());
  const userIdRef = useRef<string | undefined>(userId);

  // Update the ref when userId changes
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  /**
   * Logs an outgoing call
   *
   * @param session The SIP.js Session object for the outgoing call
   */
  const logOutgoingCall = useCallback((session: Session) => {
    if (!userIdRef.current) {
      console.warn('Cannot log call: No userId provided');
      return;
    }

    // Only log the call if it's not already being logged
    if (!activeCallsRef.current.has(session.id)) {
      console.log(`Logging outgoing call for user: ${userIdRef.current}`);

      // Set up listeners for call state changes
      const stateChangeListener = async (state: string) => {
        if (state === 'Established') {
          try {
            // Record call start and get the function to record call end
            const recordEndFn = await recordCallStart(userIdRef.current!, session, 'outgoing');
            
            // Store the function to record call end
            activeCallsRef.current.set(session.id, recordEndFn);
            
            // Set up listener for call termination
            session.stateChange.addListener((newState) => {
              if (newState === 'Terminated') {
                handleCallTermination(session);
              }
            });
          } catch (error) {
            console.error('Error logging outgoing call start:', error);
          }
        }
      };

      // Add the state change listener
      session.stateChange.addListener(stateChangeListener);
    }
  }, []);

  /**
   * Logs an incoming call
   *
   * @param invitation The SIP.js Invitation object for the incoming call
   */
  const logIncomingCall = useCallback((invitation: Invitation) => {
    if (!userIdRef.current) {
      console.warn('Cannot log call: No userId provided');
      return;
    }

    // Only log the call if it's not already being logged
    if (!activeCallsRef.current.has(invitation.id)) {
      console.log(`Logging incoming call for user: ${userIdRef.current}`);

      // Set up listeners for call state changes
      const stateChangeListener = async (state: string) => {
        if (state === 'Established') {
          try {
            // Record call start and get the function to record call end
            const recordEndFn = await recordCallStart(userIdRef.current!, invitation, 'incoming');
            
            // Store the function to record call end
            activeCallsRef.current.set(invitation.id, recordEndFn);
            
            // Set up listener for call termination
            invitation.stateChange.addListener((newState) => {
              if (newState === 'Terminated') {
                handleCallTermination(invitation);
              }
            });
          } catch (error) {
            console.error('Error logging incoming call start:', error);
          }
        }
      };

      // Add the state change listener
      invitation.stateChange.addListener(stateChangeListener);
    }
  }, []);

  /**
   * Handles call termination by recording the call end
   *
   * @param session The SIP.js Session object for the terminated call
   */
  const handleCallTermination = useCallback(async (session: Session) => {
    const recordEndFn = activeCallsRef.current.get(session.id);
    
    if (recordEndFn) {
      try {
        await recordEndFn();
        console.log(`Call end recorded for session: ${session.id}`);
      } catch (error) {
        console.error('Error recording call end:', error);
      } finally {
        // Remove the call from active calls
        activeCallsRef.current.delete(session.id);
      }
    }
  }, []);

  /**
   * Logs a call (either incoming or outgoing)
   *
   * @param session The SIP.js Session object for the call
   */
  const logCall = useCallback((session: Session) => {
    if (session instanceof Invitation) {
      logIncomingCall(session);
    } else if (session instanceof Inviter) {
      logOutgoingCall(session);
    } else {
      console.warn('Unknown session type, cannot determine call direction');
    }
  }, [logIncomingCall, logOutgoingCall]);

  // Clean up any active calls when the component unmounts
  useEffect(() => {
    return () => {
      // Record call end for any active calls
      activeCallsRef.current.forEach(async (recordEndFn, sessionId) => {
        try {
          await recordEndFn();
          console.log(`Call end recorded for session: ${sessionId} during cleanup`);
        } catch (error) {
          console.error('Error recording call end during cleanup:', error);
        }
      });
      
      // Clear the active calls map
      activeCallsRef.current.clear();
    };
  }, []);

  // Return the hook's public API
  return {
    logCall,
    logOutgoingCall,
    logIncomingCall,
  };
}

/**
 * Utility function to store call ID in localStorage for recovery after page refresh
 *
 * @param sessionId The SIP.js Session ID
 * @param callRecordId The database record ID for the call
 */
export function storeCallIdForRecovery(sessionId: string, callRecordId: string) {
  try {
    // Get existing stored calls or initialize empty object
    const storedCalls = JSON.parse(localStorage.getItem('activeCalls') || '{}');
    
    // Add the new call
    storedCalls[sessionId] = {
      recordId: callRecordId,
      timestamp: new Date().toISOString(),
    };
    
    // Store back in localStorage
    localStorage.setItem('activeCalls', JSON.stringify(storedCalls));
  } catch (error) {
    console.error('Error storing call ID for recovery:', error);
  }
}

/**
 * Utility function to remove call ID from localStorage after call ends
 *
 * @param sessionId The SIP.js Session ID
 */
export function removeStoredCallId(sessionId: string) {
  try {
    // Get existing stored calls
    const storedCalls = JSON.parse(localStorage.getItem('activeCalls') || '{}');
    
    // Remove the call
    delete storedCalls[sessionId];
    
    // Store back in localStorage
    localStorage.setItem('activeCalls', JSON.stringify(storedCalls));
  } catch (error) {
    console.error('Error removing stored call ID:', error);
  }
}

/**
 * Utility function to recover calls after page refresh
 *
 * This function checks localStorage for any active calls that were not properly
 * ended (due to page refresh or browser crash) and updates them with an end time.
 */
export async function recoverActiveCalls() {
  try {
    // Get stored calls
    const storedCalls = JSON.parse(localStorage.getItem('activeCalls') || '{}');
    
    // Process each stored call
    for (const [sessionId, callData] of Object.entries(storedCalls)) {
      const { recordId, timestamp } = callData as { recordId: string, timestamp: string };
      
      // Only process calls that are not too old (e.g., within the last 24 hours)
      const callTime = new Date(timestamp).getTime();
      const now = new Date().getTime();
      const hoursSinceCall = (now - callTime) / (1000 * 60 * 60);
      
      if (hoursSinceCall < 24) {
        // Update the call record with an end time
        await fetch('/api/call-history', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recordId,
            endTime: new Date(),
            notes: 'Call ended due to page refresh or browser crash',
          }),
        });
        
        console.log(`Recovered call with ID: ${recordId}`);
      }
      
      // Remove the call from localStorage
      delete storedCalls[sessionId];
    }
    
    // Update localStorage
    localStorage.setItem('activeCalls', JSON.stringify(storedCalls));
  } catch (error) {
    console.error('Error recovering active calls:', error);
  }
}
