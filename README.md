# SIP.js Softphone Development Guidelines

This document provides guidelines and instructions for developing and testing the SIP.js Softphone application.

## Table of Contents
- [Build and Configuration Instructions](#build-and-configuration-instructions)
- [Database and Authentication](#database-and-authentication)
- [API Routes](#api-routes)
- [Testing Information](#testing-information)
- [Development Guidelines](#development-guidelines)

## Build and Configuration Instructions

### Prerequisites
- Node.js v16 or later
- PostgreSQL database (local installation or cloud service like Supabase)
- A SIP server with WebSocket support (e.g., Asterisk, FreeSWITCH, Kamailio)

### Installation

1. Clone the repository and install dependencies:
   ```bash
   git clone <repository-url>
   cd test-sipjs-softphone-dev1
   npm install
   ```

2. Generate SSL certificates (required for WebRTC):
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

   > **Important**: WebRTC requires HTTPS, even for local development. The application checks for these certificates and enables HTTPS automatically when they're present.

### Development Server

Start the development server:
```bash
npm run dev
```

The application will be available at `https://localhost:3000`. You may need to accept the self-signed certificate warning in your browser.

### Production Build

Build the application for production:
```bash
npm run build
```

Start the production server:
```bash
npm run start
```

## Database and Authentication

The application uses Prisma ORM with PostgreSQL for database management and includes a complete authentication system.

### Database Setup

1. The project uses Prisma with PostgreSQL. Make sure you have PostgreSQL installed or use a cloud service like Supabase.

2. Configure your database connection in the `.env` file:
   ```
   DATABASE_URL="postgresql://postgres:password@localhost:5432/database_name"
   ```

3. Run Prisma migrations to set up the database schema:
   ```bash
   npx prisma migrate dev
   ```

4. Generate Prisma client:
   ```bash
   npx prisma generate
   ```

### Database Schema

The database includes the following models:

- **User**: Stores user authentication information
- **RegisterConfig**: Stores SIP registration configuration for each user
- **CallHistory**: Tracks call history with timestamps and call direction

You can view the complete schema in `prisma/schema.prisma`.

### Authentication System

The application includes a complete authentication system with:

1. **User Registration**: New users can create accounts with username and password
2. **User Login**: Existing users can log in with their credentials
3. **Password Hashing**: Passwords are securely hashed using bcrypt
4. **Session Management**: User sessions are maintained in the application state

Authentication is required before accessing the SIP functionality.

## API Routes

The application includes several API endpoints for managing users, call history, and SIP configuration.

### User Management

- **POST /api/register**: Create a new user account
  ```json
  {
    "username": "user123",
    "password": "securepassword"
  }
  ```

- **POST /api/login**: Authenticate a user
  ```json
  {
    "username": "user123",
    "password": "securepassword"
  }
  ```

### SIP Configuration

- **GET /api/user-config?userId={userId}**: Retrieve SIP configuration for a user
- **POST /api/user-config**: Create or update SIP configuration
  ```json
  {
    "userId": "user-id",
    "sipServer": "wss://sip-server.example.com",
    "sipUsername": "sip-username",
    "sipPassword": "sip-password",
    "sipDomain": "sip-domain.example.com",
    "sipPort": 5060,
    "useWebSocket": true
  }
  ```

### Call History

- **GET /api/call-history?userId={userId}**: Retrieve call history for a user
- **POST /api/call-history**: Create a new call history record
  ```json
  {
    "userId": "user-id",
    "direction": "outgoing",
    "phoneExt": "1234",
    "startTime": "2023-08-01T12:00:00Z",
    "endTime": "2023-08-01T12:05:30Z",
    "notes": "Business call"
  }
  ```

## Testing Information

The project uses Jest and React Testing Library for testing. The tests are configured to work with Next.js and TypeScript.

### Running Tests

Run all tests:
```bash
npm test
```

Run tests in watch mode (useful during development):
```bash
npm run test:watch
```

### Test Structure

Tests are organized in `__tests__` directories alongside the components they test. For example:
- `src/components/__tests__/ComponentName.test.tsx`

### Writing Tests

Here's an example of a test for a component:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ComponentName from '../ComponentName';

// Mock any dependencies
jest.mock('../../lib/dependency', () => ({
  someFunction: jest.fn(),
}));

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName prop1="value" />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('handles user interaction', () => {
    render(<ComponentName prop1="value" />);
    fireEvent.click(screen.getByText('Click Me'));
    expect(screen.getByText('Result')).toBeInTheDocument();
  });
});
```

### Testing WebRTC Components

When testing components that use WebRTC APIs, you'll need to mock those APIs. The project includes mocks for:
- MediaStream
- AudioContext/webkitAudioContext
- navigator.mediaDevices.getUserMedia

These mocks are defined in `jest.setup.js`.

### Example: Testing the Dialer Component

Here's a simplified example of testing the Dialer component:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Dialer from '../Dialer';
import { makeCall } from '../../lib/sipClient';

// Mock the sipClient module
jest.mock('../../lib/sipClient', () => ({
  makeCall: jest.fn(),
}));

describe('Dialer Component', () => {
  it('renders the dialer component correctly', () => {
    render(<Dialer domain="example.com" />);
    expect(screen.getByText('New Call')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter SIP address or phone number')).toBeInTheDocument();
  });

  it('updates the input field when typing', () => {
    render(<Dialer domain="example.com" />);
    const input = screen.getByPlaceholderText('Enter SIP address or phone number');
    fireEvent.change(input, { target: { value: '1234' } });
    expect(input).toHaveValue('1234');
  });

  it('calls makeCall with correct parameters when clicking the call button', async () => {
    // Mock the makeCall function to return a mock session
    const mockSession = { id: 'mock-session-id' };
    (makeCall as jest.Mock).mockResolvedValue(mockSession);
    
    // Mock the onCallInitiated callback
    const onCallInitiated = jest.fn();
    
    render(<Dialer domain="example.com" onCallInitiated={onCallInitiated} />);
    
    // Enter a target
    const input = screen.getByPlaceholderText('Enter SIP address or phone number');
    fireEvent.change(input, { target: { value: '1234' } });
    
    // Click the call button
    fireEvent.click(screen.getByText('Audio Call'));
    
    // Check if makeCall was called with the correct parameters
    expect(makeCall).toHaveBeenCalledWith('1234', false);
  });
});
```

## Development Guidelines

### Project Structure

The project follows a standard Next.js structure with TypeScript:

- `src/app`: Next.js app router components
- `src/components`: React components
- `src/lib`: Utility functions and libraries
- `public`: Static assets

### Key Components

- `SIPRegistration`: Handles SIP account registration
- `Dialer`: Interface for making calls
- `CallControls`: Controls for managing active calls
- `VideoPanel`: Video display for calls
- `Messaging`: Messaging functionality
- `IncomingCall`: Handling incoming calls
- `sipClient.ts`: Core SIP client functionality

### SIP.js Integration

The application uses SIP.js for WebRTC-based communication. Key features:

1. **SIP Registration**: Connect to a SIP server via WebSocket
2. **Call Handling**: Make and receive calls with audio and video
3. **Messaging**: Send and receive SIP messages
4. **Call Transfer**: Transfer active calls to another SIP address

### WebRTC Considerations

- Always test with HTTPS (required for WebRTC)
- Test with different browsers (Chrome, Firefox, Safari)
- Test with different devices (desktop, mobile)
- Check microphone and camera permissions
- Handle network changes and ICE connection failures

### Debugging WebRTC

The application includes built-in debugging tools:

1. **Debug Audio**: Checks audio tracks and connections
2. **Debug Info**: Shows detailed information about the WebRTC connection

When developing WebRTC features:
- Check browser console for detailed logs
- Use the built-in debugging tools
- Test with different network conditions
- Verify SDP negotiation is working correctly

### Code Style

- Use TypeScript for type safety
- Use functional components with hooks
- Use Tailwind CSS for styling
- Follow React best practices (avoid direct DOM manipulation, use state properly)
- Handle errors gracefully with user-friendly messages
