"use client";
import { useState } from "react";

export default function TestAPI() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Test user registration
  const testRegister = async () => {
    setLoading(true);
    try {
      const username = `test_user_${Date.now()}`;
      const password = "password123";

      // Log the request
      addResult("Register Request", { username, password: "***" });

      // Make the API call
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      
      // Log the response
      addResult(`Register Response (${response.status})`, data);
      
      // If successful, store the user ID for other tests
      if (response.ok) {
        localStorage.setItem("testUserId", data.id);
        localStorage.setItem("testUsername", username);
        localStorage.setItem("testPassword", password);
      }
    } catch (error) {
      addResult("Register Error", error);
    } finally {
      setLoading(false);
    }
  };

  // Test user login
  const testLogin = async () => {
    setLoading(true);
    try {
      const username = localStorage.getItem("testUsername") || "";
      const password = localStorage.getItem("testPassword") || "";

      if (!username || !password) {
        addResult("Login Error", "No test user found. Please register first.");
        setLoading(false);
        return;
      }

      // Log the request
      addResult("Login Request", { username, password: "***" });

      // Make the API call
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      
      // Log the response
      addResult(`Login Response (${response.status})`, data);
    } catch (error) {
      addResult("Login Error", error);
    } finally {
      setLoading(false);
    }
  };

  // Test saving user config
  const testSaveConfig = async () => {
    setLoading(true);
    try {
      const userId = localStorage.getItem("testUserId") || "";

      if (!userId) {
        addResult("Save Config Error", "No test user found. Please register first.");
        setLoading(false);
        return;
      }

      const config = {
        userId,
        sipServer: "example.com",
        sipUsername: "sipuser",
        sipPassword: "sippassword",
        sipDomain: "example.com",
        sipPort: 5060,
        useWebSocket: true,
      };

      // Log the request
      addResult("Save Config Request", { ...config, sipPassword: "***" });

      // Make the API call
      const response = await fetch("/api/user-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();
      
      // Log the response
      addResult(`Save Config Response (${response.status})`, data);
    } catch (error) {
      addResult("Save Config Error", error);
    } finally {
      setLoading(false);
    }
  };

  // Test getting user config
  const testGetConfig = async () => {
    setLoading(true);
    try {
      const userId = localStorage.getItem("testUserId") || "";

      if (!userId) {
        addResult("Get Config Error", "No test user found. Please register first.");
        setLoading(false);
        return;
      }

      // Log the request
      addResult("Get Config Request", { userId });

      // Make the API call
      const response = await fetch(`/api/user-config?userId=${userId}`);
      const data = await response.json();
      
      // Log the response
      addResult(`Get Config Response (${response.status})`, data);
    } catch (error) {
      addResult("Get Config Error", error);
    } finally {
      setLoading(false);
    }
  };

  // Test recording call history
  const testRecordCall = async () => {
    setLoading(true);
    try {
      const userId = localStorage.getItem("testUserId") || "";

      if (!userId) {
        addResult("Record Call Error", "No test user found. Please register first.");
        setLoading(false);
        return;
      }

      const callData = {
        userId,
        direction: "outgoing",
        phoneExt: "1234567890",
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 60000).toISOString(), // 1 minute call
        notes: "Test call",
      };

      // Log the request
      addResult("Record Call Request", callData);

      // Make the API call
      const response = await fetch("/api/call-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(callData),
      });

      const data = await response.json();
      
      // Log the response
      addResult(`Record Call Response (${response.status})`, data);
    } catch (error) {
      addResult("Record Call Error", error);
    } finally {
      setLoading(false);
    }
  };

  // Test getting call history
  const testGetCallHistory = async () => {
    setLoading(true);
    try {
      const userId = localStorage.getItem("testUserId") || "";

      if (!userId) {
        addResult("Get Call History Error", "No test user found. Please register first.");
        setLoading(false);
        return;
      }

      // Log the request
      addResult("Get Call History Request", { userId });

      // Make the API call
      const response = await fetch(`/api/call-history?userId=${userId}`);
      const data = await response.json();
      
      // Log the response
      addResult(`Get Call History Response (${response.status})`, data);
    } catch (error) {
      addResult("Get Call History Error", error);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to add a result to the results array
  const addResult = (title: string, data: any) => {
    setResults((prev) => [
      { title, data, timestamp: new Date().toISOString() },
      ...prev,
    ]);
  };

  // Clear all results
  const clearResults = () => {
    setResults([]);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">API Test Page</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Test API Endpoints</h2>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <button
              onClick={testRegister}
              disabled={loading}
              className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded disabled:opacity-50"
            >
              Test Register
            </button>
            
            <button
              onClick={testLogin}
              disabled={loading}
              className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded disabled:opacity-50"
            >
              Test Login
            </button>
            
            <button
              onClick={testSaveConfig}
              disabled={loading}
              className="bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded disabled:opacity-50"
            >
              Test Save Config
            </button>
            
            <button
              onClick={testGetConfig}
              disabled={loading}
              className="bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded disabled:opacity-50"
            >
              Test Get Config
            </button>
            
            <button
              onClick={testRecordCall}
              disabled={loading}
              className="bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 rounded disabled:opacity-50"
            >
              Test Record Call
            </button>
            
            <button
              onClick={testGetCallHistory}
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600 text-white py-2 px-4 rounded disabled:opacity-50"
            >
              Test Get Call History
            </button>
          </div>
          
          <button
            onClick={clearResults}
            className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded w-full"
          >
            Clear Results
          </button>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Test Results</h2>
            <span className="text-gray-500 text-sm">{results.length} results</span>
          </div>
          
          {loading && (
            <div className="flex justify-center items-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          )}
          
          {results.length === 0 ? (
            <div className="text-gray-500 text-center py-8">
              No results yet. Run a test to see results here.
            </div>
          ) : (
            <div className="space-y-4">
              {results.map((result, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium">{result.title}</h3>
                    <span className="text-xs text-gray-500">{new Date(result.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <pre className="bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
