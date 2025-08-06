"use client";
import { useEffect, useState } from 'react';
import { recoverActiveCalls } from '../hooks/useCallLogger';

/**
 * Component that handles recovery of interrupted calls after page refreshes
 *
 * This component should be placed high in the component tree, ideally in the
 * main layout or app component, to ensure it runs on every page load.
 */
export default function CallRecovery() {
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryComplete, setRecoveryComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only run recovery once when the component mounts
    const runRecovery = async () => {
      if (isRecovering || recoveryComplete) return;
      
      setIsRecovering(true);
      setError(null);
      
      try {
        await recoverActiveCalls();
        setRecoveryComplete(true);
      } catch (err) {
        console.error('Error recovering calls:', err);
        setError(err instanceof Error ? err.message : 'Unknown error recovering calls');
      } finally {
        setIsRecovering(false);
      }
    };

    runRecovery();
  }, [isRecovering, recoveryComplete]);

  // This component doesn't render anything visible
  return null;
}
