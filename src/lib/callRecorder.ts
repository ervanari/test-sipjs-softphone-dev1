/**
 * Call Recording Module
 *
 * This module provides functionality to automatically record all incoming and outgoing calls
 * to the PostgreSQL database via the API. It hooks into the SIP.js call lifecycle events
 * to detect call start and end, and records the relevant information.
 *
 * Usage:
 * 1. Import the recordCallStart function in your SIP client
 * 2. Call recordCallStart when a call is established, passing the userId, session, and direction
 * 3. The function returns another function that should be called when the call ends
 *
 * Example:
 * ```
 * // When a call is established
 * const recordEndFn = await recordCallStart(userId, session, 'outgoing');
 *
 * // When the call ends
 * await recordEndFn();
 * ```
 */

import { Session, Inviter, Invitation } from 'sip.js';
import { storeCallIdForRecovery, removeStoredCallId } from '../hooks/useCallLogger';

/**
 * Interface representing a call record to be stored in the database
 */
interface CallRecord {
  userId: string;
  direction: 'incoming' | 'outgoing';
  phoneExt: string;
  startTime: Date;
  endTime?: Date;
  notes?: string;
  recordId?: string; // To track the record ID for updating
}

// Store active calls to update them when they end
const activeCalls = new Map<string, CallRecord>();

/**
 * Records the start of a call and returns a function to record the end of the call
 *
 * @param userId The ID of the user making/receiving the call
 * @param session The SIP.js session object
 * @param direction Whether the call is incoming or outgoing
 * @returns A function to call when the call ends
 */
export async function recordCallStart(
  userId: string,
  session: Session,
  direction: 'incoming' | 'outgoing'
): Promise<() => Promise<void>> {
  try {
    // Extract the phone number or SIP extension from the session
    let phoneExt = '';
    
    if (direction === 'outgoing') {
      // For outgoing calls, get the target URI from the request URI
      const requestUri = (session as Inviter).request.requestUri;
      phoneExt = extractPhoneFromUri(requestUri?.toString() || '');
    } else {
      // For incoming calls, get the caller URI from the from URI
      const fromUri = (session as Invitation).request.from.uri;
      phoneExt = extractPhoneFromUri(fromUri?.toString() || '');
    }

    // Create a call record
    const callRecord: CallRecord = {
      userId,
      direction,
      phoneExt,
      startTime: new Date(),
    };

    console.log(`Recording ${direction} call start: ${phoneExt}`);

    // Save the call record to the database
    try {
      const response = await fetch('/api/call-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(callRecord),
      });

      if (!response.ok) {
        throw new Error(`Failed to save call record: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Store the record ID for updating later
      callRecord.recordId = data.id;
      
      // Store the call record in memory to update it when the call ends
      const sessionId = session.id;
      activeCalls.set(sessionId, callRecord);
      
      // Store the call ID in localStorage for recovery after page refresh
      storeCallIdForRecovery(sessionId, data.id);
      
      console.log(`Call record created with ID: ${data.id}`);
    } catch (error) {
      console.error('Error saving call record:', error);
      // Still store the call record in memory to try updating it when the call ends
      const sessionId = session.id;
      activeCalls.set(sessionId, callRecord);
    }

    // Return a function to record the end of the call
    return async () => {
      await recordCallEnd(session);
    };
  } catch (error) {
    console.error('Error recording call start:', error);
    // Return a no-op function
    return async () => {};
  }
}

/**
 * Records the end of a call
 *
 * @param session The SIP.js session object
 */
export async function recordCallEnd(session: Session): Promise<void> {
  try {
    const sessionId = session.id;
    const callRecord = activeCalls.get(sessionId);

    if (!callRecord) {
      console.warn(`No call record found for session ID: ${sessionId}`);
      return;
    }

    // Update the call record with the end time
    callRecord.endTime = new Date();

    console.log(`Recording call end: ${callRecord.phoneExt}`);

    // Update the call record in the database
    try {
      const response = await fetch('/api/call-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(callRecord),
      });

      if (!response.ok) {
        throw new Error(`Failed to update call record: ${response.statusText}`);
      }

      console.log(`Call record updated with end time: ${callRecord.endTime.toISOString()}`);
      
      // Remove the call ID from localStorage
      removeStoredCallId(sessionId);
    } catch (error) {
      console.error('Error updating call record:', error);
      // Implement retry logic here if needed
    }

    // Remove the call record from memory
    activeCalls.delete(sessionId);
  } catch (error) {
    console.error('Error recording call end:', error);
  }
}

/**
 * Extracts the phone number or SIP extension from a URI
 *
 * @param uri The SIP URI
 * @returns The phone number or SIP extension
 */
function extractPhoneFromUri(uri: string): string {
  // Handle empty URI
  if (!uri) return '';

  // Extract the user part from the URI (e.g., "sip:1234@example.com" -> "1234")
  const match = uri.match(/sip:([^@]+)@/);
  return match ? match[1] : uri;
}
