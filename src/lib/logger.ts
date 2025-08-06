/**
 * Logger Utility
 *
 * A centralized logging system for the SIP.js softphone application.
 * This utility provides methods for logging at different levels (error, warn, info, debug)
 * and supports different output destinations (console, localStorage, server).
 */

// Log levels in order of severity
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

// Configuration for the logger
interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableLocalStorage: boolean;
  enableServerLogging: boolean;
  maxLocalStorageLogs: number;
  localStorageKey: string;
  serverLogEndpoint?: string;
}

// Default configuration
const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: LogLevel.INFO,
  enableConsole: true,
  enableLocalStorage: true,
  enableServerLogging: true,
  maxLocalStorageLogs: 1000,
  localStorageKey: 'sip_app_logs',
  serverLogEndpoint: '/api/logs'
};

// Current configuration
let config: LoggerConfig = { ...DEFAULT_CONFIG };

// Log entry interface
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: any;
  component?: string;
  sessionId?: string;
  userId?: string;
  stack?: string;
}

/**
 * Configure the logger
 * @param newConfig Partial configuration to merge with current config
 */
export function configureLogger(newConfig: Partial<LoggerConfig>): void {
  config = { ...config, ...newConfig };
  debug('Logger configured', { config });
}

/**
 * Log an error message
 * @param message The error message
 * @param context Additional context for the error
 * @param component The component where the error occurred
 */
export function error(message: string, context?: any, component?: string): void {
  log(LogLevel.ERROR, message, context, component);
}

/**
 * Log a warning message
 * @param message The warning message
 * @param context Additional context for the warning
 * @param component The component where the warning occurred
 */
export function warn(message: string, context?: any, component?: string): void {
  log(LogLevel.WARN, message, context, component);
}

/**
 * Log an info message
 * @param message The info message
 * @param context Additional context for the info
 * @param component The component where the info occurred
 */
export function info(message: string, context?: any, component?: string): void {
  log(LogLevel.INFO, message, context, component);
}

/**
 * Log a debug message
 * @param message The debug message
 * @param context Additional context for the debug
 * @param component The component where the debug occurred
 */
export function debug(message: string, context?: any, component?: string): void {
  log(LogLevel.DEBUG, message, context, component);
}

/**
 * Log a message at the specified level
 * @param level The log level
 * @param message The message to log
 * @param context Additional context
 * @param component The component where the log occurred
 */
function log(level: LogLevel, message: string, context?: any, component?: string): void {
  // Skip if log level is higher than configured minimum level
  if (level > config.minLevel) {
    return;
  }

  // Create log entry
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    levelName: LogLevel[level],
    message,
    component,
    context
  };

  // Add stack trace for errors
  if (level === LogLevel.ERROR && context instanceof Error) {
    entry.stack = context.stack;
  }

  // Add session ID if available
  if (typeof window !== 'undefined' && (window as any).currentSessionId) {
    entry.sessionId = (window as any).currentSessionId;
  }

  // Add user ID if available
  if (typeof window !== 'undefined' && (window as any).currentUserId) {
    entry.userId = (window as any).currentUserId;
  }

  // Log to console if enabled
  if (config.enableConsole) {
    logToConsole(entry);
  }

  // Log to localStorage if enabled
  if (config.enableLocalStorage && typeof window !== 'undefined') {
    logToLocalStorage(entry);
  }

  // Log to server if enabled
  if (config.enableServerLogging && config.serverLogEndpoint) {
    logToServer(entry);
  }
}

/**
 * Log to the console with appropriate styling
 * @param entry The log entry
 */
function logToConsole(entry: LogEntry): void {
  const timestamp = entry.timestamp.split('T')[1].split('.')[0]; // Extract time part
  const component = entry.component ? `[${entry.component}]` : '';
  const sessionId = entry.sessionId ? `[Session: ${entry.sessionId}]` : '';
  const userId = entry.userId ? `[User: ${entry.userId}]` : '';
  
  const prefix = `${timestamp} ${component} ${sessionId} ${userId}`;
  
  switch (entry.level) {
    case LogLevel.ERROR:
      console.error(`❌ ${prefix} ${entry.message}`, entry.context || '');
      if (entry.stack) {
        console.error(entry.stack);
      }
      break;
    case LogLevel.WARN:
      console.warn(`⚠️ ${prefix} ${entry.message}`, entry.context || '');
      break;
    case LogLevel.INFO:
      console.info(`ℹ️ ${prefix} ${entry.message}`, entry.context || '');
      break;
    case LogLevel.DEBUG:
      console.debug(`🔍 ${prefix} ${entry.message}`, entry.context || '');
      break;
  }
}

/**
 * Log to localStorage, maintaining a circular buffer of logs
 * @param entry The log entry
 */
function logToLocalStorage(entry: LogEntry): void {
  try {
    // Get existing logs
    const logsJson = localStorage.getItem(config.localStorageKey) || '[]';
    let logs: LogEntry[] = JSON.parse(logsJson);
    
    // Add new log
    logs.push(entry);
    
    // Trim logs if they exceed the maximum
    if (logs.length > config.maxLocalStorageLogs) {
      logs = logs.slice(logs.length - config.maxLocalStorageLogs);
    }
    
    // Save logs back to localStorage
    localStorage.setItem(config.localStorageKey, JSON.stringify(logs));
  } catch (e) {
    // If localStorage fails, log to console as fallback
    console.error('Failed to log to localStorage:', e);
  }
}

/**
 * Log to server
 * @param entry The log entry
 */
function logToServer(entry: LogEntry): void {
  if (!config.serverLogEndpoint) return;
  
  // Don't block execution with await
  fetch(config.serverLogEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(entry),
    // Use keepalive to ensure the request completes even if the page is unloading
    keepalive: true
  }).catch(e => {
    // If server logging fails, log to console as fallback
    console.error('Failed to log to server:', e);
  });
}

/**
 * Get all logs from localStorage
 * @returns Array of log entries
 */
export function getLogs(): LogEntry[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const logsJson = localStorage.getItem(config.localStorageKey) || '[]';
    return JSON.parse(logsJson);
  } catch (e) {
    console.error('Failed to retrieve logs from localStorage:', e);
    return [];
  }
}

/**
 * Clear all logs from localStorage
 */
export function clearLogs(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(config.localStorageKey);
  } catch (e) {
    console.error('Failed to clear logs from localStorage:', e);
  }
}

/**
 * Download logs as a JSON file
 */
export function downloadLogs(): void {
  if (typeof window === 'undefined') return;
  
  try {
    const logs = getLogs();
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `sip-app-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Failed to download logs:', e);
  }
}

/**
 * Set the current session ID for logging
 * @param sessionId The SIP session ID
 */
export function setSessionId(sessionId: string | null): void {
  if (typeof window !== 'undefined') {
    (window as any).currentSessionId = sessionId;
  }
}

/**
 * Set the current user ID for logging
 * @param userId The user ID
 */
export function setUserId(userId: string | null): void {
  if (typeof window !== 'undefined') {
    (window as any).currentUserId = userId;
  }
}

// Export a default logger object for convenience
export default {
  error,
  warn,
  info,
  debug,
  configure: configureLogger,
  getLogs,
  clearLogs,
  downloadLogs,
  setSessionId,
  setUserId
};
