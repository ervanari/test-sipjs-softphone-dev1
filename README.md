# WebRTC Softphone

A Next.js-based softphone application integrated with SIP.js for making voice and video calls over WebRTC.

## Features

- SIP account registration
- Voice calls
- Video calls
- Text messaging
- Call transfer
- Incoming call notifications with ringtone
- Responsive UI with Tailwind CSS

## Prerequisites

- Node.js (v16 or later)
- A SIP server with WebSocket support (e.g., Asterisk, FreeSWITCH, Kamailio)

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd test-sipjs
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Generate SSL certificates for local development (required for WebRTC):
   ```bash
   mkdir certificates
   cd certificates

   # For macOS/Linux
   openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' \
     -keyout localhost-key.pem -out localhost.pem

   # For Windows (using Git Bash or similar)
   openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '//CN=localhost' \
     -keyout localhost-key.pem -out localhost.pem

   cd ..
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `https://localhost:3000`
   - You may need to accept the self-signed certificate warning

## Usage

1. **Register your SIP account**:
   - Enter your SIP URI (e.g., `user@domain.com`)
   - Enter your username and password
   - The default WebSocket server is set to `wss://jsmwebrtc.my.id:443/ws`, but you can change it to your SIP server's WebSocket address

2. **Make a call**:
   - Enter the target SIP address or phone number in the dialer
   - Check the "Video Call" checkbox if you want to make a video call
   - Click the "Call" button

3. **Receive a call**:
   - When someone calls you, you'll see an incoming call notification
   - Click "Audio" to accept as an audio call
   - Click "Video" to accept as a video call
   - Click "Reject" to decline the call

4. **During a call**:
   - Use the "Hang Up" button to end the call
   - Use the "Mute" button to toggle your microphone
   - Use the transfer section to transfer the call to another SIP address

5. **Send messages**:
   - Enter the recipient's SIP address
   - Type your message and click "Send"

## Configuration

The application connects to a SIP server via WebSocket. You can configure the WebSocket server address in the registration form.

## Development

This project uses:
- Next.js for the framework
- Tailwind CSS for styling
- SIP.js for SIP/WebRTC functionality

## Troubleshooting

- **WebRTC not working**: Make sure you're using HTTPS (with the generated certificates) as WebRTC requires secure contexts
- **Cannot register**: Check your SIP credentials and WebSocket server address
- **No audio/video**: Check your browser permissions for microphone and camera access

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## License

[MIT License](LICENSE)
