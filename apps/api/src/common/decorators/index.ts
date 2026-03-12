import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@/database/entities/user.entity';

// ── @Public() — Mark route as public (no auth required) ──
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// ── @Roles(...roles) — Restrict to specific roles ──
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// ── @CurrentUser() — Extract user from request ──
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

// ── Role hierarchy helpers ──
const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.USER]: 0,
  [UserRole.PRO]: 0,
  [UserRole.OPERATOR]: 10,
  [UserRole.OPERATOR_SENIOR]: 20,
  [UserRole.SUPERVISOR]: 30,
  [UserRole.ADMIN]: 40,
  [UserRole.AUDITOR]: 5, // Read-only, low hierarchy
};

export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
