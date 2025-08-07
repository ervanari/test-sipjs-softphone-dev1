'use client';

import { create } from 'zustand';
import { Session, UserAgent } from 'sip.js';

// Define the store state type
interface SipState {
  // SIP session and user agent
  currentSession: Session | null;
  userAgent: UserAgent | null;
  
  // Call state
  isIncomingCall: boolean;
  callState: 'idle' | 'ringing' | 'establishing' | 'established' | 'terminated';
  
  // Actions
  setCurrentSession: (session: Session | null) => void;
  setUserAgent: (userAgent: UserAgent | null) => void;
  setIsIncomingCall: (isIncoming: boolean) => void;
  setCallState: (state: 'idle' | 'ringing' | 'establishing' | 'established' | 'terminated') => void;
  
  // Reset state
  resetState: () => void;
}

// Create the store
const useSipStore = create<SipState>((set) => ({
  // Initial state
  currentSession: null,
  userAgent: null,
  isIncomingCall: false,
  callState: 'idle',
  
  // Actions
  setCurrentSession: (session) => {
    console.log('SIP Store: Setting current session', session?.id || 'null');
    set({ currentSession: session });
    
    // If session is null, reset call state
    if (!session) {
      set({ callState: 'idle' });
    }
  },
  
  setUserAgent: (userAgent) => {
    console.log('SIP Store: Setting user agent', userAgent ? 'defined' : 'null');
    set({ userAgent: userAgent });
  },
  
  setIsIncomingCall: (isIncoming) => {
    console.log('SIP Store: Setting isIncomingCall', isIncoming);
    set({ isIncomingCall: isIncoming });
  },
  
  setCallState: (state) => {
    console.log('SIP Store: Setting call state', state);
    set({ callState: state });
  },
  
  // Reset state
  resetState: () => {
    console.log('SIP Store: Resetting state');
    set({
      currentSession: null,
      isIncomingCall: false,
      callState: 'idle',
    });
  },
}));

export default useSipStore;
