import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAuthenticated } from '@/lib/auth';

// Define the paths that require authentication
const protectedPaths = [
  '/dashboard',
  '/user-config',
  '/call-history',
];

// Define the paths that are public
const publicPaths = [
  '/',
  '/login',
  '/register',
  '/api/login',
  '/api/register',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the path is protected
  const isProtectedPath = protectedPaths.some(path =>
    pathname === path || pathname.startsWith(`${path}/`)
  );

  // Check if the path is public
  const isPublicPath = publicPaths.some(path =>
    pathname === path || pathname.startsWith(`${path}/`)
  );

  // If it's a public path, allow access
  if (isPublicPath) {
    return NextResponse.next();
  }

  // If it's a protected path, check authentication
  if (isProtectedPath) {
    const isUserAuthenticated = await isAuthenticated(request);

    // If not authenticated, redirect to login
    if (!isUserAuthenticated) {
      const url = new URL('/', request.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
  }

  // For API routes, check authentication
  if (pathname.startsWith('/api/') && !isPublicPath) {
    const isUserAuthenticated = await isAuthenticated(request);

    // If not authenticated, return 401 Unauthorized
    if (!isUserAuthenticated) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

// Configure the middleware to run on specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
