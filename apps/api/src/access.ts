// Only call with fixed SQL aliases/placeholders, never with request data.
export function caseScope(alias = 'r', actor = '$2', role = '$3') {
  return `(${alias}.owner_id=${actor} OR (${alias}.stage<>'DRAFT' AND ${role}<>'ADMIN'
    AND NOT EXISTS(SELECT 1 FROM conflicts f WHERE f.report_id=${alias}.id AND f.user_id=${actor})
    AND EXISTS(SELECT 1 FROM case_access a WHERE a.report_id=${alias}.id AND a.user_id=${actor} AND a.revoked_at IS NULL)))`;
}
