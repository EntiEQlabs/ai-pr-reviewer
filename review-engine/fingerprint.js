import crypto from 'crypto';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'in', 'on', 'for', 'of', 'to', 'with', 'and', 'or',
  'should', 'must', 'be', 'by', 'as', 'at', 'from', 'that', 'this', 'it', 'use',
  'avoid', 'potential', 'possible', 'detected', 'found', 'missing', 'unhandled'
]);

/**
 * Normalizes title / issue text to core semantic keywords to ensure deterministic matching
 */
export function normalizeKeywords(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .sort()
    .join('_');
}

/**
 * Generate a deterministic fingerprint for an AI review finding.
 */
export function generateFingerprint(finding) {
  const file = (finding.file || '').trim();
  const rule = (finding.rule_id || finding.category || 'GENERAL').trim().toLowerCase();
  const keywords = normalizeKeywords(finding.title || finding.description || '');
  const key = `${file}:${rule}:${keywords.slice(0, 60)}`;
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
}

/**
 * Format fingerprint & metadata comment tags for insertion into GitHub comments
 */
export function getFingerprintTag(fingerprint, finding = {}) {
  const metaObj = {
    fp: fingerprint,
    file: finding.file || '',
    line: finding.line || 0,
    category: finding.category || '',
    rule: finding.rule_id || ''
  };
  const metaBase64 = Buffer.from(JSON.stringify(metaObj)).toString('base64');
  return `<!-- ai-review-finding:${fingerprint} -->\n<!-- ai-review-meta:${metaBase64} -->`;
}

/**
 * Parses finding metadata and fingerprint from comment body
 */
export function parseCommentMetadata(body = '') {
  let fingerprint = null;
  let meta = null;

  const fpMatch = body.match(/<!-- ai-review-finding:([a-f0-9]{16}) -->/);
  if (fpMatch) {
    fingerprint = fpMatch[1];
  }

  const metaMatch = body.match(/<!-- ai-review-meta:([A-Za-z0-9+/=]+) -->/);
  if (metaMatch) {
    try {
      meta = JSON.parse(Buffer.from(metaMatch[1], 'base64').toString('utf8'));
    } catch {
      meta = null;
    }
  }

  return { fingerprint, meta };
}

/**
 * Extracts all existing findings information from PR comments
 */
export function extractExistingFindings(comments = []) {
  const existing = [];

  for (const comment of comments) {
    const body = comment.body || '';
    const { fingerprint, meta } = parseCommentMetadata(body);

    if (fingerprint || meta || body.includes('🤖 AI Review:')) {
      existing.push({
        id: comment.id || comment.databaseId,
        nodeId: comment.node_id || comment.id,
        path: comment.path || meta?.file,
        line: comment.line || comment.original_line || meta?.line,
        fingerprint: fingerprint || meta?.fp,
        meta,
        body,
        isResolved: comment.isResolved || false,
        threadId: comment.threadId || null
      });
    }
  }

  return existing;
}

/**
 * Checks if a current finding matches an existing comment
 * Uses exact fingerprint matching and proximity/semantic heuristics
 */
export function isSameFinding(finding, existingComment) {
  // 1. Exact fingerprint match
  if (finding.fingerprint && existingComment.fingerprint && finding.fingerprint === existingComment.fingerprint) {
    return true;
  }

  const findingFile = (finding.file || '').trim();
  const commentFile = (existingComment.path || existingComment.meta?.file || '').trim();

  // Must match the same file
  if (findingFile !== commentFile) {
    return false;
  }

  const findingLine = finding.line || 0;
  const commentLine = existingComment.line || existingComment.meta?.line || 0;

  // 2. Line proximity check (within +/- 4 lines)
  const lineDiff = Math.abs(findingLine - commentLine);
  if (lineDiff <= 4) {
    // Check if same rule_id
    if (finding.rule_id && existingComment.meta?.rule && finding.rule_id === existingComment.meta.rule) {
      return true;
    }

    // Check if same category
    if (finding.category && (existingComment.meta?.category === finding.category || existingComment.body?.includes(finding.category))) {
      const findingKeywords = normalizeKeywords(finding.title || '');
      const commentKeywords = normalizeKeywords(existingComment.body || '');
      if (!findingKeywords || !commentKeywords) return true;

      // Check keyword overlap
      const findingWords = new Set(findingKeywords.split('_'));
      const matchingCount = commentKeywords.split('_').filter((w) => findingWords.has(w)).length;
      if (matchingCount >= 1) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Enriches findings with fingerprints and flags whether each finding is new or already reported
 */
export function filterNewFindings(findings, existingComments = []) {
  const existingList = Array.isArray(existingComments) ? existingComments : Array.from(existingComments.values());

  return findings.map((finding) => {
    const fingerprint = generateFingerprint(finding);
    const enrichedFinding = { ...finding, fingerprint };

    const matchedComment = existingList.find((c) => isSameFinding(enrichedFinding, c));

    return {
      ...enrichedFinding,
      isNew: !matchedComment,
      matchedCommentId: matchedComment?.id || null,
      matchedThreadId: matchedComment?.threadId || null
    };
  });
}
