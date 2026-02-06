import { describe, it, expect } from 'vitest';
import { evaluateApplicabilityRule, evaluateMultipleTemplates } from '../electron/engine/applicability';
import type {
  ActivityTemplateApplicabilityRule,
  ActivityTemplateApplicabilityClause,
  ApplicabilityContext,
} from '../shared/types';

const NMR_RANKS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const PA_RANKS = ['Critical', 'High', 'Medium', 'Low'];

function makeRule(overrides: Partial<ActivityTemplateApplicabilityRule> = {}): ActivityTemplateApplicabilityRule {
  return {
    id: 1,
    activityTemplateId: 1,
    operator: 'ALL',
    enabled: true,
    createdAt: '2025-01-01',
    ...overrides,
  };
}

function makeClause(overrides: Partial<ActivityTemplateApplicabilityClause> & { comparator: ActivityTemplateApplicabilityClause['comparator']; value: string }): ActivityTemplateApplicabilityClause {
  return {
    id: 1,
    ruleId: 1,
    subjectType: 'SUPPLIER_NMR',
    createdAt: '2025-01-01',
    ...overrides,
  };
}

// ============================================================
// EQ / NEQ comparators
// ============================================================
describe('EQ comparator', () => {
  it('matches exact value', () => {
    const clause = makeClause({ comparator: 'EQ', value: 'B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'B1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(true);
  });

  it('does not match different value', () => {
    const clause = makeClause({ comparator: 'EQ', value: 'B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'A1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(false);
  });
});

describe('NEQ comparator', () => {
  it('matches when not equal', () => {
    const clause = makeClause({ comparator: 'NEQ', value: 'B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'A1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(true);
  });

  it('does not match when equal', () => {
    const clause = makeClause({ comparator: 'NEQ', value: 'A1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'A1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(false);
  });
});

// ============================================================
// IN / NOT_IN comparators
// ============================================================
describe('IN comparator', () => {
  it('matches when value is in comma-separated list', () => {
    const clause = makeClause({ comparator: 'IN', value: 'A1,B1,C1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'B1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(true);
  });

  it('does not match when value is not in list', () => {
    const clause = makeClause({ comparator: 'IN', value: 'A1,B1,C1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'B2', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(false);
  });

  it('handles spaces in comma-separated values', () => {
    const clause = makeClause({ comparator: 'IN', value: 'A1, B1, C1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'B1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(true);
  });
});

describe('NOT_IN comparator', () => {
  it('matches when value is not in list', () => {
    const clause = makeClause({ comparator: 'NOT_IN', value: 'A1,B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'C1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(true);
  });

  it('does not match when value is in list', () => {
    const clause = makeClause({ comparator: 'NOT_IN', value: 'A1,B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'A1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(false);
  });
});

// ============================================================
// GTE / LTE comparators (rank ordering)
// ============================================================
describe('GTE comparator', () => {
  it('A1 >= B1 is true (higher rank)', () => {
    const clause = makeClause({ comparator: 'GTE', value: 'B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'A1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(true);
  });

  it('B1 >= B1 is true (equal rank)', () => {
    const clause = makeClause({ comparator: 'GTE', value: 'B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'B1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(true);
  });

  it('C1 >= B1 is false (lower rank)', () => {
    const clause = makeClause({ comparator: 'GTE', value: 'B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'C1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(false);
  });

  it('returns false for unknown rank not in array', () => {
    const clause = makeClause({ comparator: 'GTE', value: 'B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'X9', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(false);
  });
});

describe('LTE comparator', () => {
  it('C1 <= B1 is true (lower rank)', () => {
    const clause = makeClause({ comparator: 'LTE', value: 'B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'C1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(true);
  });

  it('B1 <= B1 is true (equal rank)', () => {
    const clause = makeClause({ comparator: 'LTE', value: 'B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'B1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(true);
  });

  it('A1 <= B1 is false (higher rank)', () => {
    const clause = makeClause({ comparator: 'LTE', value: 'B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'A1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(false);
  });
});

// ============================================================
// ALL / ANY operators
// ============================================================
describe('ALL operator', () => {
  it('requires all clauses to match', () => {
    const clauses = [
      makeClause({ id: 1, comparator: 'GTE', value: 'B1' }),
      makeClause({ id: 2, comparator: 'LTE', value: 'C1' }),
    ];
    // B2 is >= B1? B2 index=3, B1 index=2. 3 <= 2 is false. So GTE fails.
    const ctx: ApplicabilityContext = { supplierNmrRank: 'B2', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule({ operator: 'ALL' }), clauses, ctx, NMR_RANKS)).toBe(false);
  });

  it('passes when all clauses match', () => {
    const clauses = [
      makeClause({ id: 1, comparator: 'GTE', value: 'C1' }),
      makeClause({ id: 2, comparator: 'LTE', value: 'A1' }),
    ];
    // B1: GTE C1? B1(2) <= C1(4) -> true. LTE A1? B1(2) >= A1(0) -> true.
    const ctx: ApplicabilityContext = { supplierNmrRank: 'B1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule({ operator: 'ALL' }), clauses, ctx, NMR_RANKS)).toBe(true);
  });
});

describe('ANY operator', () => {
  it('passes when at least one clause matches', () => {
    const clauses = [
      makeClause({ id: 1, comparator: 'EQ', value: 'A1' }),
      makeClause({ id: 2, comparator: 'EQ', value: 'B1' }),
    ];
    const ctx: ApplicabilityContext = { supplierNmrRank: 'B1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule({ operator: 'ANY' }), clauses, ctx, NMR_RANKS)).toBe(true);
  });

  it('fails when no clauses match', () => {
    const clauses = [
      makeClause({ id: 1, comparator: 'EQ', value: 'A1' }),
      makeClause({ id: 2, comparator: 'EQ', value: 'B1' }),
    ];
    const ctx: ApplicabilityContext = { supplierNmrRank: 'C1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule({ operator: 'ANY' }), clauses, ctx, NMR_RANKS)).toBe(false);
  });
});

// ============================================================
// Disabled rules and edge cases
// ============================================================
describe('disabled rule', () => {
  it('always returns true', () => {
    const clause = makeClause({ comparator: 'EQ', value: 'A1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'C1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule({ enabled: false }), [clause], ctx, NMR_RANKS)).toBe(true);
  });
});

describe('no clauses', () => {
  it('always returns true', () => {
    const ctx: ApplicabilityContext = { supplierNmrRank: 'C1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [], ctx, NMR_RANKS)).toBe(true);
  });
});

describe('null supplier rank', () => {
  it('EQ returns false for null', () => {
    const clause = makeClause({ comparator: 'EQ', value: 'A1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: null, partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(false);
  });

  it('NEQ returns true for null', () => {
    const clause = makeClause({ comparator: 'NEQ', value: 'A1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: null, partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(true);
  });

  it('NOT_IN returns true for null', () => {
    const clause = makeClause({ comparator: 'NOT_IN', value: 'A1,B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: null, partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(true);
  });

  it('GTE returns false for null', () => {
    const clause = makeClause({ comparator: 'GTE', value: 'B1' });
    const ctx: ApplicabilityContext = { supplierNmrRank: null, partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, NMR_RANKS)).toBe(false);
  });
});

// ============================================================
// PART_PA subject type
// ============================================================
describe('PART_PA subject', () => {
  it('matches when at least one part rank satisfies clause', () => {
    const clause = makeClause({ subjectType: 'PART_PA', comparator: 'EQ', value: 'Critical' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'A1', partPaRanks: ['High', 'Critical', 'Low'] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, PA_RANKS)).toBe(true);
  });

  it('fails when no part ranks match', () => {
    const clause = makeClause({ subjectType: 'PART_PA', comparator: 'EQ', value: 'Critical' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'A1', partPaRanks: ['High', 'Low'] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, PA_RANKS)).toBe(false);
  });

  it('returns false with empty partPaRanks', () => {
    const clause = makeClause({ subjectType: 'PART_PA', comparator: 'EQ', value: 'Critical' });
    const ctx: ApplicabilityContext = { supplierNmrRank: 'A1', partPaRanks: [] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, PA_RANKS)).toBe(false);
  });

  it('GTE works with PA ranks', () => {
    // PA_RANKS = ['Critical','High','Medium','Low']. Critical(0) >= Medium(2) -> true
    const clause = makeClause({ subjectType: 'PART_PA', comparator: 'GTE', value: 'Medium' });
    const ctx: ApplicabilityContext = { supplierNmrRank: null, partPaRanks: ['Critical'] };
    expect(evaluateApplicabilityRule(makeRule(), [clause], ctx, PA_RANKS)).toBe(true);
  });
});

// ============================================================
// evaluateMultipleTemplates
// ============================================================
describe('evaluateMultipleTemplates', () => {
  it('evaluates multiple templates at once', () => {
    const templates = [
      {
        templateId: 1,
        rule: makeRule({ id: 1, activityTemplateId: 1 }),
        clauses: [makeClause({ comparator: 'EQ', value: 'A1' })],
      },
      {
        templateId: 2,
        rule: makeRule({ id: 2, activityTemplateId: 2 }),
        clauses: [makeClause({ comparator: 'GTE', value: 'B1' })],
      },
      {
        templateId: 3,
        rule: null,
        clauses: [],
      },
    ];
    const ctx: ApplicabilityContext = { supplierNmrRank: 'B1', partPaRanks: [] };
    const result = evaluateMultipleTemplates(templates, ctx, NMR_RANKS);

    expect(result.get(1)).toBe(false); // EQ A1, supplier is B1 -> false
    expect(result.get(2)).toBe(true);  // GTE B1, supplier is B1 -> true
    expect(result.get(3)).toBe(true);  // No rule -> always true
  });
});
