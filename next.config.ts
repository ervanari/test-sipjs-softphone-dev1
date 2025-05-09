import type { NextConfig } from "next";
import fs from 'fs';
import path from 'path';

// Check if SSL certificates exist
const certPath = path.join(process.cwd(), 'certificates');
const keyPath = path.join(certPath, 'localhost-key.pem');
const certFilePath = path.join(certPath, 'localhost.pem');

let httpsConfig = undefined;

try {
  if (fs.existsSync(keyPath) && fs.existsSync(certFilePath)) {
    httpsConfig = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certFilePath),
    };
  }
} catch (error) {
  console.warn('SSL certificates not found. HTTPS will not be enabled for development.');
  console.warn('See README.md for instructions on generating certificates.');
}

const nextConfig: NextConfig = {
  // Enable HTTPS for development if certificates are available
  ...(httpsConfig && {
    devServer: {
      https: httpsConfig,
    },
  }),

  // Add headers for security
  headers: async () => {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            // Allow camera, microphone, and display-capture for WebRTC
            value: 'camera=self, microphone=self, display-capture=self'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
