import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { LogEntry } from '@/lib/logger';

const prisma = new PrismaClient();

// Configuration
const CONFIG = {
  // Whether to store logs in the database
  storeInDatabase: false,
  // Whether to store logs in files
  storeInFiles: true,
  // Directory to store log files (relative to project root)
  logDirectory: 'logs',
  // Maximum number of logs to return in a single request
  maxLogsPerRequest: 100,
};

/**
 * POST /api/logs
 *
 * Stores logs sent from the client
 * Body: LogEntry or LogEntry[]
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

    // Parse the request body
    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error('Error parsing log request body:', error);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Handle both single log entry and array of log entries
    const logEntries: LogEntry[] = Array.isArray(body) ? body : [body];

    // Store logs based on configuration
    if (CONFIG.storeInDatabase) {
      await storeLogsInDatabase(logEntries);
    }

    if (CONFIG.storeInFiles) {
      await storeLogsInFiles(logEntries);
    }

    return NextResponse.json({ success: true, count: logEntries.length });
  } catch (error) {
    console.error('Error storing logs:', error);
    return NextResponse.json(
      { error: 'Failed to store logs' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/logs
 *
 * Retrieves logs from the server
 * Query parameters:
 * - level: Minimum log level to retrieve (ERROR, WARN, INFO, DEBUG)
 * - startDate: Start date for logs (ISO string)
 * - endDate: End date for logs (ISO string)
 * - userId: Filter logs by user ID
 * - sessionId: Filter logs by session ID
 * - component: Filter logs by component
 * - limit: Maximum number of logs to return (default: 100)
 * - offset: Number of logs to skip (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const level = searchParams.get('level');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const userId = searchParams.get('userId');
    const sessionId = searchParams.get('sessionId');
    const component = searchParams.get('component');
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '100'),
      CONFIG.maxLogsPerRequest
    );
    const offset = parseInt(searchParams.get('offset') || '0');

    // Retrieve logs based on configuration
    let logs: any[] = [];
    
    if (CONFIG.storeInDatabase) {
      logs = await getLogsFromDatabase({
        level,
        startDate,
        endDate,
        userId,
        sessionId,
        component,
        limit,
        offset,
      });
    } else if (CONFIG.storeInFiles) {
      logs = await getLogsFromFiles({
        level,
        startDate,
        endDate,
        userId,
        sessionId,
        component,
        limit,
        offset,
      });
    }

    return NextResponse.json({ data: logs });
  } catch (error) {
    console.error('Error retrieving logs:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve logs' },
      { status: 500 }
    );
  }
}

/**
 * Store logs in the database
 * @param logs Array of log entries
 */
async function storeLogsInDatabase(logs: LogEntry[]) {
  // This is a placeholder for database storage
  // In a real implementation, you would create a Prisma model for logs
  // and store the logs in the database
  
  // Example implementation:
  /*
  await prisma.log.createMany({
    data: logs.map(log => ({
      timestamp: new Date(log.timestamp),
      level: log.level,
      levelName: log.levelName,
      message: log.message,
      component: log.component,
      sessionId: log.sessionId,
      userId: log.userId,
      context: log.context ? JSON.stringify(log.context) : null,
      stack: log.stack,
    })),
  });
  */
  
  console.log(`Stored ${logs.length} logs in database`);
}

/**
 * Store logs in files
 * @param logs Array of log entries
 */
async function storeLogsInFiles(logs: LogEntry[]) {
  // Ensure log directory exists
  const logDir = path.join(process.cwd(), CONFIG.logDirectory);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Group logs by date
  const logsByDate = logs.reduce((acc, log) => {
    const date = log.timestamp.split('T')[0]; // Extract date part (YYYY-MM-DD)
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(log);
    return acc;
  }, {} as Record<string, LogEntry[]>);

  // Write logs to files by date
  for (const [date, dateLogs] of Object.entries(logsByDate)) {
    const logFile = path.join(logDir, `${date}.log`);
    
    // Format logs as JSON lines (one JSON object per line)
    const logLines = dateLogs.map(log => JSON.stringify(log)).join('\n') + '\n';
    
    // Append to file
    fs.appendFileSync(logFile, logLines);
  }
  
  console.log(`Stored ${logs.length} logs in files`);
}

/**
 * Get logs from the database
 * @param filters Filters for retrieving logs
 */
async function getLogsFromDatabase(filters: any) {
  // This is a placeholder for database retrieval
  // In a real implementation, you would query the Prisma model for logs
  
  // Example implementation:
  /*
  return await prisma.log.findMany({
    where: {
      ...(filters.level && { level: { gte: LogLevel[filters.level] } }),
      ...(filters.startDate && { timestamp: { gte: new Date(filters.startDate) } }),
      ...(filters.endDate && { timestamp: { lte: new Date(filters.endDate) } }),
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.sessionId && { sessionId: filters.sessionId }),
      ...(filters.component && { component: filters.component }),
    },
    orderBy: {
      timestamp: 'desc',
    },
    skip: filters.offset,
    take: filters.limit,
  });
  */
  
  return [];
}

/**
 * Get logs from files
 * @param filters Filters for retrieving logs
 */
async function getLogsFromFiles(filters: any) {
  const logDir = path.join(process.cwd(), CONFIG.logDirectory);
  if (!fs.existsSync(logDir)) {
    return [];
  }

  // Determine which log files to read based on date filters
  let logFiles: string[] = [];
  
  if (filters.startDate || filters.endDate) {
    // If date filters are provided, only read relevant files
    const startDate = filters.startDate ? new Date(filters.startDate) : new Date(0);
    const endDate = filters.endDate ? new Date(filters.endDate) : new Date();
    
    // Generate a list of dates between start and end
    const dates: string[] = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Filter to only existing log files
    logFiles = dates
      .map(date => path.join(logDir, `${date}.log`))
      .filter(file => fs.existsSync(file));
  } else {
    // If no date filters, read all log files
    logFiles = fs.readdirSync(logDir)
      .filter(file => file.endsWith('.log'))
      .map(file => path.join(logDir, file));
  }

  // Read and parse logs from files
  let allLogs: LogEntry[] = [];
  
  for (const file of logFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          const log = JSON.parse(line) as LogEntry;
          allLogs.push(log);
        } catch (error) {
          console.error(`Error parsing log line: ${line}`, error);
        }
      }
    }
  }

  // Apply filters
  let filteredLogs = allLogs;
  
  if (filters.level) {
    const levelValue = ['ERROR', 'WARN', 'INFO', 'DEBUG'].indexOf(filters.level);
    if (levelValue >= 0) {
      filteredLogs = filteredLogs.filter(log => log.level <= levelValue);
    }
  }
  
  if (filters.userId) {
    filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
  }
  
  if (filters.sessionId) {
    filteredLogs = filteredLogs.filter(log => log.sessionId === filters.sessionId);
  }
  
  if (filters.component) {
    filteredLogs = filteredLogs.filter(log => log.component === filters.component);
  }

  // Sort by timestamp (newest first)
  filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Apply pagination
  return filteredLogs.slice(filters.offset, filters.offset + filters.limit);
}
