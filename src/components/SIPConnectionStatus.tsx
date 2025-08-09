'use client';

import { useSIP } from './SIPProvider';

export default function SIPConnectionStatus() {
  const { isRegistered, username, domain } = useSIP();

  console.log('SIPConnectionStatus:', {
    isRegistered,
    username,
    domain,
  })
  
  if (!isRegistered) {
    return (
      <div className="text-xs text-gray-500 flex items-center">
        <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>
        Not Connected
      </div>
    );
  }

  return (
    <div className="text-xs text-green-600 flex items-center">
      <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>
      Connected as <span className="font-medium">{username}@{domain}</span>
    </div>
  );
}
