import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const userId = (request as any).user?.id || 'anonymous';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const duration = Date.now() - start;
        const { statusCode } = response;

        this.logger.log(
          `${method} ${url} ${statusCode} ${duration}ms — user:${userId} ip:${ip}`,
        );

        // Alert if response is slow
        if (duration > 2000) {
          this.logger.warn(
            `SLOW REQUEST: ${method} ${url} took ${duration}ms`,
          );
        }
      }),
    );
  }
}
