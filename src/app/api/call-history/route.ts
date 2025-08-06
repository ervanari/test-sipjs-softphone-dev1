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
    const body = await request.json();
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
