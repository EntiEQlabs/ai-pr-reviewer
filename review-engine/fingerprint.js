import crypto from 'crypto';

/**
 * Generate a deterministic fingerprint for an AI review finding.
 */
export function generateFingerprint(finding) {
  const normalizedTitle = (finding.title || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  const key = `${finding.file}:${finding.category}:${normalizedTitle}`;
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
}

/**
 * Format a fingerprint comment tag for insertion into GitHub comments
 */
export function getFingerprintTag(fingerprint) {
  return `<!-- ai-review-finding:${fingerprint} -->`;
}

/**
 * Extracts all finding fingerprints from existing PR comments
 */
export function extractExistingFingerprints(comments = []) {
  const existing = new Set();
  const regex = /<!-- ai-review-finding:([a-f0-9]{16}) -->/;

  for (const comment of comments) {
    const body = comment.body || '';
    const match = body.match(regex);
    if (match) {
      existing.add(match[1]);
    }
  }

  return existing;
}

/**
 * Filters findings to remove any that have already been commented on the PR
 */
export function filterNewFindings(findings, existingFingerprints) {
  return findings.map((finding) => {
    const fingerprint = generateFingerprint(finding);
    const isNew = !existingFingerprints.has(fingerprint);
    return {
      ...finding,
      fingerprint,
      isNew
    };
  });
}
