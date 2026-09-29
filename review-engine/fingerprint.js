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
 * Returns Map<fingerprint, commentObject>
 */
export function extractExistingFingerprints(comments = []) {
  const existing = new Map();
  const regex = /<!-- ai-review-finding:([a-f0-9]{16}) -->/;

  for (const comment of comments) {
    const body = comment.body || '';
    const match = body.match(regex);
    if (match) {
      existing.set(match[1], comment);
    }
  }

  return existing;
}

/**
 * Filters findings to identify which are new vs already reported
 */
export function filterNewFindings(findings, existingFingerprintsMap) {
  return findings.map((finding) => {
    const fingerprint = generateFingerprint(finding);
    const isNew = !existingFingerprintsMap.has(fingerprint);
    return {
      ...finding,
      fingerprint,
      isNew
    };
  });
}
