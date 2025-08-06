import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Define the session data structure
export interface SessionData {
  userId: string;
  username: string;
  isLoggedIn: boolean;
}

// Define the user data structure
export interface User {
  id: string;
  username: string;
  createdAt: Date;
}

// Session configuration
export const sessionOptions = {
  password: process.env.SESSION_PASSWORD || 'complex_password_at_least_32_characters_long',
  cookieName: 'sipjs_session',
  cookieOptions: {
    // secure: true should be used in production (HTTPS) but can be false in development (HTTP)
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict' as const,
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  },
};

// Get the session from the request
export async function getSession(req?: NextRequest) {
  const cookieStore = cookies();
  
  // Use the request cookies if provided, otherwise use the server cookies
  const session = await getIronSession<SessionData>(
    req ? req.cookies : cookieStore,
    sessionOptions
  );

  // Initialize the session if it's not already
  if (!session.isLoggedIn) {
    session.isLoggedIn = false;
    session.userId = '';
    session.username = '';
  }

  return session;
}

// Get the current user from the session
export async function getCurrentUser(req?: NextRequest): Promise<User | null> {
  const session = await getSession(req);

  // If the user is not logged in, return null
  if (!session.isLoggedIn || !session.userId) {
    return null;
  }

  try {
    // Get the user from the database
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        createdAt: true,
      },
    });

    return user;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Helper function to get the session on the server side
export async function getServerSession() {
  const session = await getSession();
  return session;
}

// Create a session for a user
export async function createSession(res: NextResponse, user: { id: string; username: string }) {
  const session = await getSession();
  
  session.userId = user.id;
  session.username = user.username;
  session.isLoggedIn = true;
  
  await session.save();
  
  return session;
}

// Destroy the session
export async function destroySession() {
  const session = await getSession();
  
  session.userId = '';
  session.username = '';
  session.isLoggedIn = false;
  
  await session.save();
  
  return session;
}

// Check if a route is protected
export async function isAuthenticated(req: NextRequest) {
  const session = await getSession(req);
  return session.isLoggedIn;
}
