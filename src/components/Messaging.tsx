"use client";
import { useState, forwardRef, useImperativeHandle, useRef, useEffect } from "react";
import { sendMessage } from "../lib/sipClient";

interface MessagingProps {
  domain: string;
  onMessageReceived?: (from: string, body: string) => void;
}

const Messaging = forwardRef<{addReceivedMessage: (from: string, body: string) => void}, MessagingProps>(
  ({ domain }, ref) => {
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<{from: string; body: string; time: Date}[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of messages when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const handleSendMessage = async () => {
    console.log("Sending message:", { target, domain, message });
    if (!target || !message) return;

    // Clear previous errors
    setSendError(null);
    setIsSending(true);

    try {
      // Construct the full SIP URI if not already provided
      const fullTarget = target.includes('@') ? target : `sip:${target}@${domain}`;

      // Send the message
      await sendMessage(fullTarget, message);

      // Add to local messages list on success
      setMessages(prev => [
        ...prev,
        {
          from: "me",
          body: message,
          time: new Date()
        }
      ]);

      // Clear message input
      setMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
      setSendError(error instanceof Error ? error.message : "Failed to send message");

      // Show error for 5 seconds
      setTimeout(() => setSendError(null), 5000);
    } finally {
      setIsSending(false);
    }
  };

  // This function is called when a message is received
  const addReceivedMessage = (from: string, body: string) => {
    setMessages(prev => [
      ...prev,
      {
        from,
        body,
        time: new Date()
      }
    ]);
  };

  // Expose the addReceivedMessage function to parent components
  useImperativeHandle(ref, () => ({
    addReceivedMessage
  }));

  // Format time to display in chat
  const formatMessageTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Contact/Recipient Header */}
      <div className="bg-[#f0f2f5] p-3 border-b flex items-center">
        <input
          type="text"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Enter recipient SIP address"
          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#128C7E] text-black"
        />
      </div>

      {/* Messages Area */}
      <div
        className="flex-1 overflow-y-auto p-4 bg-[#e5ded8]"
        style={{
          backgroundImage: "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAABmJLR0QA/wD/AP+gvaeTAAAA+UlEQVQ4y+3UMUoDQRTG8Z+KWohYpBIFQbDRK4iVpZWlp/AQHkFPIHgC05lC0EoQJJVoEUxEMYVuiphhHbLJbBIE8YPhfTPz3n/fvJl5k8QYo4pDLGMGO7jCOV7xUeeJqnCBFexhBuWUreMWD5jGRpFhC0dYK0i2jWXs4wk3GMdGnmEVh5gfIFjELJ7RxQfO8IUdnOTJKjjAVoFYC1OZYBPn+MQp7vGOBSzlwmMFYg28ZIJdPGZ7PYynzHSuX7iBToFYfUDsO9vr4hbjg4ShUBTL/+mXxUKlX6wUC5V+sWosVPrFJmKh0i/W7hcb9C3/1i82hVuM/AJUknwy+rYVBwAAAABJRU5ErkJggg==')",
          backgroundRepeat: 'repeat'
        }}
      >
        {messages.length > 0 ? (
          <div className="space-y-2">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.from === 'me' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`rounded-lg p-3 max-w-[75%] relative ${
                    msg.from === 'me'
                      ? 'bg-[#dcf8c6] text-black'
                      : 'bg-white text-black'
                  }`}
                >
                  {msg.from !== 'me' && (
                    <div className="text-xs font-bold text-[#128C7E] mb-1">
                      {msg.from}
                    </div>
                  )}
                  <div className="break-words">{msg.body}</div>
                  <div className="text-xs text-gray-500 text-right mt-1">
                    {formatMessageTime(msg.time)}
                    {msg.from === 'me' && (
                      <span className="ml-1 text-[#4fc3f7]">✓✓</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <div className="w-16 h-16 bg-[#128C7E] rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-center font-medium">Start a conversation</p>
            <p className="text-center text-sm mt-2">Enter a SIP address above and send a message</p>
          </div>
        )}
      </div>

      {/* Error Message */}
      {sendError && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-2 text-sm">
          <p>{sendError}</p>
        </div>
      )}

      {/* Message Input */}
      <div className="bg-[#f0f2f5] p-3 flex flex-col">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message"
            className="flex-1 py-2 px-4 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#128C7E] text-black"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSending && target && message) {
                handleSendMessage();
              }
            }}
            disabled={isSending}
          />
          <button
            onClick={handleSendMessage}
            disabled={!target || !message || isSending}
            className="bg-[#128C7E] hover:bg-[#0e6b5e] text-white rounded-full p-2 disabled:opacity-50 transition duration-200"
          >
            {isSending ? (
              <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>

        {/* Sending status */}
        {isSending && (
          <div className="text-xs text-gray-500 mt-1 ml-2">
            Sending message...
          </div>
        )}
      </div>
    </div>
  );
});

// Add display name for debugging
Messaging.displayName = 'Messaging';

export default Messaging;
