import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException,
  HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
  requestId?: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let error: string;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
        error = exception.name;
      } else if (typeof exResponse === 'object') {
        const obj = exResponse as Record<string, any>;
        message = Array.isArray(obj.message) ? obj.message.join(', ') : obj.message || 'Erreur';
        error = obj.error || exception.name;
      } else {
        message = 'Erreur interne';
        error = 'Internal Server Error';
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Erreur interne du serveur';
      error = 'Internal Server Error';

      // Log full error for internal debugging — never expose to client
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Erreur inconnue';
      error = 'Unknown Error';
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: request.headers['x-request-id'] as string,
    };

    // Log 4xx and 5xx differently
    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} → ${status}`, JSON.stringify(errorResponse));
    } else if (status >= 400) {
      this.logger.warn(`${request.method} ${request.url} → ${status}: ${message}`);
    }

    response.status(status).json(errorResponse);
  }
}
