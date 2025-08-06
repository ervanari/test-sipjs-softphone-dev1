'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalCalls: 0,
    incomingCalls: 0,
    outgoingCalls: 0,
    avgDuration: 0
  });

  useEffect(() => {
    async function fetchCallStats() {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/call-history?userId=${user.id}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch call history');
        }

        const result = await response.json();
        const calls = result.data || [];
        
        // Calculate stats
        const totalCalls = calls.length;
        const incomingCalls = calls.filter(call => call.direction === 'incoming').length;
        const outgoingCalls = calls.filter(call => call.direction === 'outgoing').length;
        
        // Calculate average duration (for completed calls only)
        const completedCalls = calls.filter(call => call.endTime);
        let totalDuration = 0;
        
        completedCalls.forEach(call => {
          const start = new Date(call.startTime).getTime();
          const end = new Date(call.endTime).getTime();
          totalDuration += (end - start);
        });
        
        const avgDuration = completedCalls.length > 0
          ? Math.floor(totalDuration / completedCalls.length / 1000)
          : 0;
        
        setStats({
          totalCalls,
          incomingCalls,
          outgoingCalls,
          avgDuration
        });
      } catch (err) {
        console.error('Error fetching call stats:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchCallStats();
  }, [user]);

  // Format seconds to mm:ss
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full">
          <h1 className="text-xl font-bold text-[#128C7E] mb-4">Authentication Required</h1>
          <p className="text-gray-600 mb-4">Please log in to view your dashboard.</p>
          <Link href="/" className="bg-[#128C7E] text-white py-2 px-4 rounded font-medium hover:bg-[#0c6b5f] focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:ring-opacity-50">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#128C7E]">Welcome, {user.username}!</h1>
        <p className="text-gray-600">Here's an overview of your SIP softphone activity</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#128C7E]"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Calls Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Calls</p>
                <p className="text-2xl font-bold text-gray-800">{stats.totalCalls}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Incoming Calls Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Incoming Calls</p>
                <p className="text-2xl font-bold text-gray-800">{stats.incomingCalls}</p>
              </div>
              <div className="p-3 rounded-full bg-green-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 3h5m0 0v5m0-5l-6 6M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Outgoing Calls Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Outgoing Calls</p>
                <p className="text-2xl font-bold text-gray-800">{stats.outgoingCalls}</p>
              </div>
              <div className="p-3 rounded-full bg-purple-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 3h5m0 0v5m0-5l-6 6M8 21H3m0 0v-5m0 5l6-6" />
                </svg>
              </div>
            </div>
          </div>

          {/* Average Duration Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Avg. Call Duration</p>
                <p className="text-2xl font-bold text-gray-800">{formatDuration(stats.avgDuration)}</p>
              </div>
              <div className="p-3 rounded-full bg-yellow-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/call" className="flex items-center p-4 bg-[#128C7E] bg-opacity-10 rounded-lg hover:bg-opacity-20 transition-all">
            <div className="p-2 rounded-full bg-[#128C7E] mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-800">Make a Call</h3>
              <p className="text-sm text-gray-600">Open the dialer</p>
            </div>
          </Link>
          
          <Link href="/call-history" className="flex items-center p-4 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all">
            <div className="p-2 rounded-full bg-gray-700 mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-800">Call History</h3>
              <p className="text-sm text-gray-600">View your call logs</p>
            </div>
          </Link>
          
          <Link href="/user-config" className="flex items-center p-4 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all">
            <div className="p-2 rounded-full bg-gray-700 mr-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium text-gray-800">Settings</h3>
              <p className="text-sm text-gray-600">Configure your SIP account</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
