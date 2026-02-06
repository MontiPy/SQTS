import type {
  ActivityTemplateApplicabilityRule,
  ActivityTemplateApplicabilityClause,
  ApplicabilityContext,
  ApplicabilityComparator,
} from '../../shared/types';

/**
 * Evaluate whether an activity template is applicable for a given context.
 *
 * MVP: Manual checkboxes are the primary mechanism. This evaluator provides
 * automatic suggestions based on rules (Phase 6 enhancement).
 *
 * @returns true if the activity should be included, false if excluded
 */
export function evaluateApplicabilityRule(
  rule: ActivityTemplateApplicabilityRule,
  clauses: ActivityTemplateApplicabilityClause[],
  context: ApplicabilityContext,
  rankOrder: string[]
): boolean {
  // Disabled rule = always include
  if (!rule.enabled) return true;

  // No clauses = always include
  if (clauses.length === 0) return true;

  const results = clauses.map(clause => evaluateClause(clause, context, rankOrder));

  return rule.operator === 'ALL'
    ? results.every(Boolean)
    : results.some(Boolean);
}

/**
 * Evaluate a single applicability clause against the context.
 */
function evaluateClause(
  clause: ActivityTemplateApplicabilityClause,
  context: ApplicabilityContext,
  rankOrder: string[]
): boolean {
  if (clause.subjectType === 'SUPPLIER_NMR') {
    return compareValue(context.supplierNmrRank, clause.comparator, clause.value, rankOrder);
  }

  if (clause.subjectType === 'PART_PA') {
    // PART_PA checks against all part PA ranks in context.
    // For IN/NOT_IN/EQ/NEQ: at least one part must match.
    // For GTE/LTE: at least one part must satisfy the rank comparison.
    if (context.partPaRanks.length === 0) return false;
    return context.partPaRanks.some(rank =>
      compareValue(rank, clause.comparator, clause.value, rankOrder)
    );
  }

  return false;
}

/**
 * Compare a subject value against a clause value using the specified comparator.
 *
 * @param subjectValue - The value being checked (e.g., supplier NMR rank "B1")
 * @param comparator - The comparison operator
 * @param clauseValue - The clause value (may be comma-separated for IN/NOT_IN)
 * @param rankOrder - Ordered array of ranks where earlier = higher (e.g., ["A1","A2","B1","B2","C1"])
 */
function compareValue(
  subjectValue: string | null,
  comparator: ApplicabilityComparator,
  clauseValue: string,
  rankOrder: string[]
): boolean {
  // Null subject can only match NOT_IN and NEQ
  if (subjectValue == null) {
    switch (comparator) {
      case 'NEQ':
        return true; // null != anything is true
      case 'NOT_IN':
        return true; // null is not in any list
      default:
        return false;
    }
  }

  switch (comparator) {
    case 'EQ':
      return subjectValue === clauseValue;

    case 'NEQ':
      return subjectValue !== clauseValue;

    case 'IN': {
      const values = parseCommaSeparated(clauseValue);
      return values.includes(subjectValue);
    }

    case 'NOT_IN': {
      const values = parseCommaSeparated(clauseValue);
      return !values.includes(subjectValue);
    }

    case 'GTE': {
      // Earlier index in rankOrder = higher rank.
      // GTE means "subject rank is >= target", meaning subject index <= target index.
      const subjectIndex = rankOrder.indexOf(subjectValue);
      const targetIndex = rankOrder.indexOf(clauseValue);
      if (subjectIndex === -1 || targetIndex === -1) return false;
      return subjectIndex <= targetIndex;
    }

    case 'LTE': {
      // LTE means "subject rank is <= target", meaning subject index >= target index.
      const subjectIndex = rankOrder.indexOf(subjectValue);
      const targetIndex = rankOrder.indexOf(clauseValue);
      if (subjectIndex === -1 || targetIndex === -1) return false;
      return subjectIndex >= targetIndex;
    }

    default:
      return false;
  }
}

/**
 * Parse a comma-separated string into trimmed values.
 */
function parseCommaSeparated(value: string): string[] {
  return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
}

/**
 * Evaluate applicability for multiple templates at once.
 * Returns a map of templateId -> isApplicable.
 *
 * Used when applying a project to a supplier to pre-check all activities.
 */
export function evaluateMultipleTemplates(
  templates: Array<{
    templateId: number;
    rule: ActivityTemplateApplicabilityRule | null;
    clauses: ActivityTemplateApplicabilityClause[];
  }>,
  context: ApplicabilityContext,
  rankOrder: string[]
): Map<number, boolean> {
  const result = new Map<number, boolean>();

  for (const { templateId, rule, clauses } of templates) {
    if (!rule) {
      // No rule = always applicable
      result.set(templateId, true);
    } else {
      result.set(templateId, evaluateApplicabilityRule(rule, clauses, context, rankOrder));
    }
  }

  return result;
}
