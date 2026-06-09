'use client';

type LogContext = Record<string, unknown>;

function formatMessage(message: string, context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) return message;
  return `${message} ${JSON.stringify(context)}`;
}

export const clientLogger = {
  error(message: string, context?: LogContext, error?: Error | unknown): void {
    const formatted = formatMessage(message, context);
    if (error instanceof Error) {
      console.error(formatted, error);
    } else {
      console.error(formatted, error ?? '');
    }
  },

  warn(message: string, context?: LogContext): void {
    console.warn(formatMessage(message, context));
  },

  info(message: string, context?: LogContext): void {
    console.info(formatMessage(message, context));
  },

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatMessage(message, context));
    }
  },
};
