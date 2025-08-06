"use client";
import CallRecovery from './CallRecovery';

/**
 * Wrapper for client components that need to be included in the server-side layout
 *
 * This component can be imported in the layout.tsx file to include client-side
 * functionality that needs to run on every page.
 */
export default function ClientComponents() {
  return (
    <>
      {/* Include the CallRecovery component to handle interrupted calls */}
      <CallRecovery />
      
      {/* Add other client components that need to be included in the layout here */}
    </>
  );
}
