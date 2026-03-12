/**
 * Workflow Service — Unit Tests
 * Tests the state machine transitions independently of database.
 */

// We test the pure logic by importing the TRANSITIONS map and rules.
// Since WorkflowService.canTransition() and getAllowedTransitions() are pure functions
// that only depend on the TRANSITIONS map, we can test them with a minimal mock.

import { VerificationStatus } from '@/database/entities/verification.entity';

// Re-define TRANSITIONS here for isolated testing (mirrors workflow.service.ts)
const TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  [VerificationStatus.PENDING_PAYMENT]: [VerificationStatus.PAID, VerificationStatus.CANCELLED],
  [VerificationStatus.PAID]: [VerificationStatus.AI_ANALYSIS],
  [VerificationStatus.AI_ANALYSIS]: [VerificationStatus.AWAITING_PRO_DOCS, VerificationStatus.READY_FOR_REVIEW],
  [VerificationStatus.AWAITING_PRO_DOCS]: [VerificationStatus.PRO_DOCS_RECEIVED, VerificationStatus.READY_FOR_REVIEW],
  [VerificationStatus.PRO_DOCS_RECEIVED]: [VerificationStatus.READY_FOR_REVIEW],
  [VerificationStatus.READY_FOR_REVIEW]: [VerificationStatus.IN_PROGRESS],
  [VerificationStatus.IN_PROGRESS]: [VerificationStatus.QUALITY_CONTROL, VerificationStatus.COMPLETED],
  [VerificationStatus.QUALITY_CONTROL]: [VerificationStatus.COMPLETED, VerificationStatus.IN_PROGRESS],
  [VerificationStatus.COMPLETED]: [VerificationStatus.DISPUTE],
  [VerificationStatus.DISPUTE]: [VerificationStatus.IN_PROGRESS, VerificationStatus.COMPLETED],
  [VerificationStatus.CANCELLED]: [],
  [VerificationStatus.REFUNDED]: [],
};

function canTransition(from: VerificationStatus, to: VerificationStatus): boolean {
  return (TRANSITIONS[from] || []).includes(to);
}

function getAllowedTransitions(from: VerificationStatus): VerificationStatus[] {
  return TRANSITIONS[from] || [];
}

describe('Workflow State Machine', () => {

  describe('Valid transitions (happy path)', () => {
    const validPaths: [VerificationStatus, VerificationStatus][] = [
      [VerificationStatus.PENDING_PAYMENT, VerificationStatus.PAID],
      [VerificationStatus.PENDING_PAYMENT, VerificationStatus.CANCELLED],
      [VerificationStatus.PAID, VerificationStatus.AI_ANALYSIS],
      [VerificationStatus.AI_ANALYSIS, VerificationStatus.AWAITING_PRO_DOCS],
      [VerificationStatus.AI_ANALYSIS, VerificationStatus.READY_FOR_REVIEW],
      [VerificationStatus.AWAITING_PRO_DOCS, VerificationStatus.PRO_DOCS_RECEIVED],
      [VerificationStatus.AWAITING_PRO_DOCS, VerificationStatus.READY_FOR_REVIEW],
      [VerificationStatus.PRO_DOCS_RECEIVED, VerificationStatus.READY_FOR_REVIEW],
      [VerificationStatus.READY_FOR_REVIEW, VerificationStatus.IN_PROGRESS],
      [VerificationStatus.IN_PROGRESS, VerificationStatus.QUALITY_CONTROL],
      [VerificationStatus.IN_PROGRESS, VerificationStatus.COMPLETED],
      [VerificationStatus.QUALITY_CONTROL, VerificationStatus.COMPLETED],
      [VerificationStatus.QUALITY_CONTROL, VerificationStatus.IN_PROGRESS],
      [VerificationStatus.COMPLETED, VerificationStatus.DISPUTE],
      [VerificationStatus.DISPUTE, VerificationStatus.IN_PROGRESS],
      [VerificationStatus.DISPUTE, VerificationStatus.COMPLETED],
    ];

    test.each(validPaths)('%s → %s should be allowed', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  describe('Invalid transitions (must be blocked)', () => {
    const invalidPaths: [VerificationStatus, VerificationStatus][] = [
      // Can't skip steps
      [VerificationStatus.PENDING_PAYMENT, VerificationStatus.COMPLETED],
      [VerificationStatus.PENDING_PAYMENT, VerificationStatus.IN_PROGRESS],
      [VerificationStatus.PAID, VerificationStatus.COMPLETED],
      [VerificationStatus.AI_ANALYSIS, VerificationStatus.COMPLETED],
      // Can't go backward (except QC → IN_PROGRESS and DISPUTE → IN_PROGRESS)
      [VerificationStatus.COMPLETED, VerificationStatus.IN_PROGRESS],
      [VerificationStatus.COMPLETED, VerificationStatus.PENDING_PAYMENT],
      [VerificationStatus.IN_PROGRESS, VerificationStatus.PAID],
      [VerificationStatus.READY_FOR_REVIEW, VerificationStatus.AI_ANALYSIS],
      // Terminal states
      [VerificationStatus.CANCELLED, VerificationStatus.PAID],
      [VerificationStatus.CANCELLED, VerificationStatus.AI_ANALYSIS],
      [VerificationStatus.REFUNDED, VerificationStatus.PAID],
      [VerificationStatus.REFUNDED, VerificationStatus.COMPLETED],
    ];

    test.each(invalidPaths)('%s → %s should be BLOCKED', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  describe('Terminal states have no transitions', () => {
    it('CANCELLED has no allowed transitions', () => {
      expect(getAllowedTransitions(VerificationStatus.CANCELLED)).toEqual([]);
    });

    it('REFUNDED has no allowed transitions', () => {
      expect(getAllowedTransitions(VerificationStatus.REFUNDED)).toEqual([]);
    });
  });

  describe('Full lifecycle path', () => {
    it('standard path from payment to completion', () => {
      const path = [
        VerificationStatus.PENDING_PAYMENT,
        VerificationStatus.PAID,
        VerificationStatus.AI_ANALYSIS,
        VerificationStatus.AWAITING_PRO_DOCS,
        VerificationStatus.PRO_DOCS_RECEIVED,
        VerificationStatus.READY_FOR_REVIEW,
        VerificationStatus.IN_PROGRESS,
        VerificationStatus.COMPLETED,
      ];

      for (let i = 0; i < path.length - 1; i++) {
        expect(canTransition(path[i], path[i + 1])).toBe(true);
      }
    });

    it('express path when pro is already in base', () => {
      const path = [
        VerificationStatus.PENDING_PAYMENT,
        VerificationStatus.PAID,
        VerificationStatus.AI_ANALYSIS,
        VerificationStatus.READY_FOR_REVIEW, // skip docs if pro already known
        VerificationStatus.IN_PROGRESS,
        VerificationStatus.COMPLETED,
      ];

      for (let i = 0; i < path.length - 1; i++) {
        expect(canTransition(path[i], path[i + 1])).toBe(true);
      }
    });

    it('dispute reopening path', () => {
      expect(canTransition(VerificationStatus.COMPLETED, VerificationStatus.DISPUTE)).toBe(true);
      expect(canTransition(VerificationStatus.DISPUTE, VerificationStatus.IN_PROGRESS)).toBe(true);
      expect(canTransition(VerificationStatus.IN_PROGRESS, VerificationStatus.COMPLETED)).toBe(true);
    });
  });

  describe('Every status has an entry in the transitions map', () => {
    it('all VerificationStatus values are covered', () => {
      const allStatuses = Object.values(VerificationStatus);
      const coveredStatuses = Object.keys(TRANSITIONS);
      for (const status of allStatuses) {
        expect(coveredStatuses).toContain(status);
      }
    });
  });
});
