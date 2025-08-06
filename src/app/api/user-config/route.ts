import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET: Retrieve SIP configuration for a user
export async function GET(request: NextRequest) {
  try {
    // Get userId from query parameters
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Retrieve SIP configuration for the user
    const config = await prisma.registerConfig.findUnique({
      where: { userId },
    });

    if (!config) {
      return NextResponse.json(
        { error: 'SIP configuration not found for this user' },
        { status: 404 }
      );
    }

    // Return the configuration (excluding sensitive fields if needed)
    return NextResponse.json({
      id: config.id,
      userId: config.userId,
      sipServer: config.sipServer,
      sipUsername: config.sipUsername,
      sipDomain: config.sipDomain,
      sipPort: config.sipPort,
      useWebSocket: config.useWebSocket,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    });
  } catch (error) {
    console.error('Error retrieving user configuration:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create or update SIP configuration for a user
export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const {
      userId,
      sipServer,
      sipUsername,
      sipPassword,
      sipDomain,
      sipPort,
      useWebSocket,
    } = body;

    // Validate required fields
    if (!userId || !sipServer || !sipUsername || !sipPassword || !sipDomain) {
      return NextResponse.json(
        {
          error:
            'User ID, SIP server, username, password, and domain are required',
        },
        { status: 400 }
      );
    }

    // Check if configuration already exists for this user
    const existingConfig = await prisma.registerConfig.findUnique({
      where: { userId },
    });

    let config;

    if (existingConfig) {
      // Update existing configuration
      config = await prisma.registerConfig.update({
        where: { userId },
        data: {
          sipServer,
          sipUsername,
          sipPassword,
          sipDomain,
          sipPort: sipPort || 5060,
          useWebSocket: useWebSocket !== undefined ? useWebSocket : true,
        },
      });
    } else {
      // Create new configuration
      config = await prisma.registerConfig.create({
        data: {
          userId,
          sipServer,
          sipUsername,
          sipPassword,
          sipDomain,
          sipPort: sipPort || 5060,
          useWebSocket: useWebSocket !== undefined ? useWebSocket : true,
        },
      });
    }

    // Return the configuration (excluding sensitive fields if needed)
    return NextResponse.json(
      {
        id: config.id,
        userId: config.userId,
        sipServer: config.sipServer,
        sipUsername: config.sipUsername,
        sipDomain: config.sipDomain,
        sipPort: config.sipPort,
        useWebSocket: config.useWebSocket,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
      { status: existingConfig ? 200 : 201 }
    );
  } catch (error) {
    console.error('Error saving user configuration:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
