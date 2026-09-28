/**
 * Style-trait matching for comment display attributes (site-agnostic).
 */

/**
 * @param {import("./nvcomment-commands.js").CommentStyleTraits} traits
 * @param {{ kind: string, mode?: string, value?: string }} condition
 */
export function conditionMatches(traits, condition) {
  if (!condition?.kind) return false;
  if (condition.kind === "color") {
    if (condition.mode === "non_default") return traits.hasNonDefaultColor;
    if (condition.mode === "default") return !traits.hasNonDefaultColor;
    return false;
  }
  if (condition.kind === "size") {
    const value = condition.value ?? "medium";
    return traits.size === value;
  }
  if (condition.kind === "position") {
    const value = condition.value ?? "naka";
    return traits.position === value;
  }
  return false;
}

/**
 * @param {import("./nvcomment-commands.js").CommentStyleTraits} traits
 * @param {{ enabled?: boolean, combinator?: string, conditions?: object[] }} rule
 */
function ruleMatches(traits, rule) {
  if (rule?.enabled === false) return false;
  const conditions = Array.isArray(rule?.conditions) ? rule.conditions : [];
  if (!conditions.length) return false;
  const combinator = rule.combinator === "and" ? "and" : "or";
  if (combinator === "and") {
    return conditions.every((c) => conditionMatches(traits, c));
  }
  return conditions.some((c) => conditionMatches(traits, c));
}

/**
 * @param {import("./nvcomment-commands.js").CommentStyleTraits} traits
 * @param {{ enabled?: boolean, combinator?: string, rules?: object[] }} styleFilter
 * @returns {{ blocked: boolean, ruleId?: string }}
 */
export function evaluateStyleFilter(traits, styleFilter) {
  if (styleFilter?.enabled !== true) return { blocked: false };
  const rules = (styleFilter.rules ?? []).filter((r) => r && r.enabled !== false);
  if (!rules.length) return { blocked: false };

  const combinator = styleFilter.combinator === "and" ? "and" : "or";
  if (combinator === "and") {
    const allMatch = rules.every((rule) => ruleMatches(traits, rule));
    if (!allMatch) return { blocked: false };
    return { blocked: true, ruleId: rules[0]?.id ?? "style" };
  }

  for (const rule of rules) {
    if (ruleMatches(traits, rule)) {
      return { blocked: true, ruleId: rule.id ?? "style" };
    }
  }
  return { blocked: false };
}
