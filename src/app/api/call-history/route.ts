import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * GET /api/call-history
 *
 * Retrieves call history for a specific user
 * Query parameters:
 * - userId: The ID of the user to retrieve call history for
 * - limit: (optional) The maximum number of records to return (default: 50)
 * - offset: (optional) The number of records to skip (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required parameter: userId' },
        { status: 400 }
      );
    }

    const callHistory = await prisma.callHistory.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        startTime: 'desc',
      },
      skip: offset,
      take: limit,
    });

    return NextResponse.json({ data: callHistory });
  } catch (error) {
    console.error('Error retrieving call history:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve call history' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/call-history
 *
 * Creates or updates a call history record
 * Body parameters:
 * - userId: The ID of the user making/receiving the call
 * - direction: 'incoming' or 'outgoing'
 * - phoneExt: The phone number or SIP extension
 * - startTime: The time the call started
 * - endTime: (optional) The time the call ended
 * - notes: (optional) Any notes about the call
 * - recordId: (optional) The ID of an existing record to update
 */
export async function POST(request: NextRequest) {
  try {
    // Check if request has a body
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 400 }
      );
    }

    // Clone the request to get the raw body for logging if needed
    const clonedRequest = request.clone();
    
    // Try to parse the JSON body with better error handling
    let body;
    try {
      body = await request.json();
      
      // Check if body is empty
      if (!body || Object.keys(body).length === 0) {
        console.error('Error: Request body is empty');
        return NextResponse.json(
          { error: 'Request body is empty' },
          { status: 400 }
        );
      }
    } catch (parseError) {
      // Log the error and try to get the raw body for debugging
      console.error('Error parsing JSON:', parseError);
      
      try {
        const rawBody = await clonedRequest.text();
        console.error('Raw request body:', rawBody);
        
        if (!rawBody || rawBody.trim() === '') {
          return NextResponse.json(
            { error: 'Request body is empty' },
            { status: 400 }
          );
        } else {
          let errorMessage = 'Failed to parse request body.';
          if (parseError instanceof Error) {
            errorMessage = `Failed to parse request body: ${parseError.message}`;
          }
          return NextResponse.json(
            { error: errorMessage },
            { status: 400 }
          );
        }
      } catch (textError) {
        console.error('Error reading raw request body:', textError);
        let errorMessage = 'Failed to parse request body.';
        if (parseError instanceof Error) {
          errorMessage = `Failed to parse request body: ${parseError.message}`;
        }
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }
    }
    
    const { userId, direction, phoneExt, startTime, endTime, notes, recordId } = body;

    // Validate required fields
    if (!userId || !direction || !phoneExt || !startTime) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, direction, phoneExt, startTime' },
        { status: 400 }
      );
    }

    // Validate direction
    if (direction !== 'incoming' && direction !== 'outgoing') {
      return NextResponse.json(
        { error: 'Invalid direction. Must be "incoming" or "outgoing"' },
        { status: 400 }
      );
    }

    // Parse dates
    const parsedStartTime = new Date(startTime);
    const parsedEndTime = endTime ? new Date(endTime) : undefined;

    if (recordId) {
      // Update existing record
      const updatedRecord = await prisma.callHistory.update({
        where: {
          id: recordId,
        },
        data: {
          endTime: parsedEndTime,
          notes,
        },
      });

      return NextResponse.json(updatedRecord);
    } else {
      // Create new record
      const newRecord = await prisma.callHistory.create({
        data: {
          userId,
          direction,
          phoneExt,
          startTime: parsedStartTime,
          endTime: parsedEndTime,
          notes,
        },
      });

      return NextResponse.json(newRecord);
    }
  } catch (error) {
    console.error('Error saving call history:', error);
    return NextResponse.json(
      { error: 'Failed to save call history' },
      { status: 500 }
    );
  }
}
