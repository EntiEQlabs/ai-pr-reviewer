import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Filter out noisy files that should not be sent to AI reasoning
 */
const IGNORED_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)bun\.lockb$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.(png|jpg|jpeg|gif|svg|ico|webp|avif|bmp|tiff|mp4|webm|mov|avi|mp3|wav|ogg|woff|woff2|eot|ttf|otf|pdf|zip|tar|gz|rar)$/i,
  /(^|\/)\.next\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)\.git\//,
  /(^|\/)\.github\/scripts\/review-engine\/node_modules\//
];

export function isIgnoredFile(filepath) {
  return IGNORED_PATTERNS.some((pattern) => pattern.test(filepath));
}

/**
 * Parses unified diff output into structured per-file diffs and tracks valid changed & hunk line numbers
 */
export function parseDiff(rawDiff) {
  const files = [];
  const diffChunks = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const chunk of diffChunks) {
    const lines = chunk.split('\n');
    const headerLine = lines[0];
    const match = headerLine.match(/a\/(.*?)\s+b\/(.*)/);
    if (!match) continue;

    const oldPath = match[1];
    const newPath = match[2];

    if (isIgnoredFile(newPath) && isIgnoredFile(oldPath)) {
      continue;
    }

    const changedLines = new Set();
    const hunkLines = new Set();
    const hunkRanges = [];
    let currentNewLine = 0;
    let inHunk = false;
    let hunkStart = 0;
    let hunkCount = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        inHunk = true;
        // Parse @@ -oldStart,oldLen +newStart,newLen @@
        const hunkMatch = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (hunkMatch) {
          currentNewLine = parseInt(hunkMatch[1], 10);
          hunkStart = currentNewLine;
          hunkCount = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
          hunkRanges.push({ start: hunkStart, end: hunkStart + Math.max(0, hunkCount - 1) });
        }
      } else if (inHunk) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          changedLines.add(currentNewLine);
          hunkLines.add(currentNewLine);
          currentNewLine++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          // Deleted line in old file, does not advance currentNewLine
        } else {
          // Context line in unified diff
          hunkLines.add(currentNewLine);
          currentNewLine++;
        }
      }
    }

    files.push({
      oldPath,
      newPath,
      isDeleted: newPath === '/dev/null',
      isNew: oldPath === '/dev/null',
      changedLines: Array.from(changedLines),
      hunkLines: Array.from(hunkLines),
      hunkRanges,
      patch: lines.slice(1).join('\n')
    });
  }

  return files;
}

/**
 * Loads custom and base SonarQube rules from sonar-rules.json or action fallback
 */
export function getSonarRulesConfig(repoRoot, actionPath) {
  const customPath = process.env.SONAR_RULES_PATH
    ? path.resolve(repoRoot, process.env.SONAR_RULES_PATH)
    : path.join(repoRoot, 'sonar-rules.json');

  if (fs.existsSync(customPath)) {
    try {
      console.log(`Loading custom Sonar rules from project: ${customPath}`);
      return JSON.parse(fs.readFileSync(customPath, 'utf8'));
    } catch (err) {
      console.warn(`Could not parse ${customPath}:`, err.message);
    }
  }

  // Fallback to built-in rules from action directory or repo
  const fallbackCandidates = [
    actionPath ? path.join(actionPath, 'default-sonar-rules.json') : null,
    actionPath ? path.join(actionPath, 'sonar-rules.json') : null,
    path.join(repoRoot, 'default-sonar-rules.json')
  ].filter(Boolean);

  for (const fallbackPath of fallbackCandidates) {
    if (fs.existsSync(fallbackPath)) {
      try {
        console.log(`Loading built-in base Sonar rules from: ${fallbackPath}`);
        return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      } catch (err) {
        console.warn(`Could not parse fallback rules at ${fallbackPath}:`, err.message);
      }
    }
  }

  return null;
}

/**
 * Loads project-level documentation context (AGENTS.md, CLAUDE.md, README.md)
 */
export function getProjectDocs(repoRoot) {
  const docs = {};
  const docFiles = ['AGENTS.md', 'CLAUDE.md', 'README.md'];

  for (const docFile of docFiles) {
    const fullPath = path.join(repoRoot, docFile);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Limit documentation length to avoid blowing up context token window
        docs[docFile] = content.slice(0, 4000);
      } catch (err) {
        console.warn(`Could not read ${docFile}:`, err.message);
      }
    }
  }

  return docs;
}

/**
 * Automatically detects project technology stack
 */
export function detectTechStack(repoRoot) {
  const stack = [];
  if (fs.existsSync(path.join(repoRoot, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) stack.push('Next.js');
      else if (deps.react) stack.push('React');
      else if (deps.vue) stack.push('Vue');
      else if (deps.angular) stack.push('Angular');
      stack.push('Node.js / TypeScript');
    } catch {
      stack.push('Node.js');
    }
  }
  if (fs.existsSync(path.join(repoRoot, 'pubspec.yaml'))) stack.push('Flutter / Dart');
  if (fs.existsSync(path.join(repoRoot, 'requirements.txt')) || fs.existsSync(path.join(repoRoot, 'pyproject.toml')) || fs.existsSync(path.join(repoRoot, 'Pipfile'))) stack.push('Python');
  if (fs.existsSync(path.join(repoRoot, 'go.mod'))) stack.push('Go');
  if (fs.existsSync(path.join(repoRoot, 'pom.xml')) || fs.existsSync(path.join(repoRoot, 'build.gradle'))) stack.push('Java / Kotlin');
  if (fs.existsSync(path.join(repoRoot, 'Cargo.toml'))) stack.push('Rust');
  if (fs.readdirSync(repoRoot).some((f) => f.endsWith('.sln') || f.endsWith('.csproj'))) stack.push('C# / .NET');
  return stack.length > 0 ? stack : ['Generic'];
}

/**
 * Collects PR metadata and diffs from GitHub event environment or local git
 */
export async function collectContext({ repoRoot, actionPath, octokit, baseRef, headRef }) {
  let prMetadata = {
    title: 'Local / Manual Review',
    body: '',
    baseRef: baseRef || 'origin/dev',
    headRef: headRef || 'HEAD',
    headSha: '',
    prNumber: null,
    owner: '',
    repo: '',
    isPullRequest: false
  };

  const eventPath = process.env.GITHUB_EVENT_PATH;
  const githubRepo = process.env.GITHUB_REPOSITORY;

  if (eventPath && fs.existsSync(eventPath)) {
    try {
      const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
      if (eventData.pull_request) {
        const pr = eventData.pull_request;
        const [owner, repo] = (githubRepo || '').split('/');
        prMetadata = {
          title: pr.title || '',
          body: pr.body || '',
          baseRef: pr.base?.ref || 'dev',
          headRef: pr.head?.ref || '',
          headSha: pr.head?.sha || '',
          prNumber: pr.number,
          owner: owner || pr.base?.repo?.owner?.login,
          repo: repo || pr.base?.repo?.name,
          isPullRequest: true
        };
      }
    } catch (err) {
      console.warn('Failed to parse GITHUB_EVENT_PATH:', err.message);
    }
  }

  // If headSha is missing, get from git
  if (!prMetadata.headSha) {
    try {
      prMetadata.headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    } catch {
      prMetadata.headSha = 'unknown';
    }
  }

  // Ensure target base branch is fetched in CI
  if (prMetadata.isPullRequest && prMetadata.baseRef) {
    try {
      execSync(`git fetch origin ${prMetadata.baseRef} --depth=50`, { cwd: repoRoot, stdio: 'ignore' });
    } catch {
      // Ignored if already fetched
    }
  }

  // Get unified diff
  let rawDiff = '';
  try {
    const diffTarget = prMetadata.isPullRequest
      ? `origin/${prMetadata.baseRef}...HEAD`
      : (baseRef ? `${baseRef}...${headRef || 'HEAD'}` : 'HEAD~1...HEAD');

    console.log(`Extracting git diff using target: ${diffTarget}`);
    rawDiff = execSync(`git diff ${diffTarget}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024
    });
  } catch (err) {
    console.warn('Falling back to local staged/unstaged git diff:', err.message);
    try {
      rawDiff = execSync('git diff HEAD', { cwd: repoRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    } catch (e) {
      console.error('Failed to get git diff:', e.message);
      rawDiff = '';
    }
  }

  const parsedFiles = parseDiff(rawDiff);
  const projectDocs = getProjectDocs(repoRoot);
  const sonarRulesConfig = getSonarRulesConfig(repoRoot, actionPath);

  // Deterministic reports (ESLint, SonarQube, Security)
  let staticAnalysisReports = {};
  const eslintReportPath = path.join(repoRoot, 'eslint-report.json');
  if (fs.existsSync(eslintReportPath)) {
    try {
      const rawEslint = JSON.parse(fs.readFileSync(eslintReportPath, 'utf8'));
      const sonarFindings = [];
      const standardLintFindings = [];

      for (const fileResult of rawEslint) {
        const relativeFile = path.relative(repoRoot, fileResult.filePath);
        for (const msg of fileResult.messages || []) {
          const item = {
            file: relativeFile,
            line: msg.line,
            ruleId: msg.ruleId,
            message: msg.message,
            severity: msg.severity === 2 ? 'ERROR' : 'WARNING'
          };
          if (msg.ruleId && msg.ruleId.startsWith('sonarjs/')) {
            sonarFindings.push(item);
          } else {
            standardLintFindings.push(item);
          }
        }
      }

      staticAnalysisReports.sonar_rules = sonarFindings.slice(0, 35);
      staticAnalysisReports.eslint_general = standardLintFindings.slice(0, 15);
    } catch (err) {
      console.warn('Could not parse eslint-report.json:', err.message);
    }
  }

  const sonarReportPath = path.join(repoRoot, 'sonar-report.json');
  if (fs.existsSync(sonarReportPath)) {
    try {
      staticAnalysisReports.sonar = JSON.parse(fs.readFileSync(sonarReportPath, 'utf8'));
    } catch (err) {
      console.warn('Could not parse sonar-report.json:', err.message);
    }
  }

  const securityReportPath = path.join(repoRoot, 'security-report.json');
  if (fs.existsSync(securityReportPath)) {
    try {
      const rawSecurity = JSON.parse(fs.readFileSync(securityReportPath, 'utf8'));
      if (rawSecurity.vulnerabilities) {
        staticAnalysisReports.npm_audit = {
          metadata: rawSecurity.metadata || {},
          vulnerabilities: Object.entries(rawSecurity.vulnerabilities).slice(0, 15).map(([pkg, info]) => ({
            package: pkg,
            severity: info.severity,
            via: info.via,
            isDirect: info.isDirect
          }))
        };
      }
    } catch (err) {
      console.warn('Could not parse security-report.json:', err.message);
    }
  }

  const snykReportPath = path.join(repoRoot, 'snyk-report.json');
  if (fs.existsSync(snykReportPath)) {
    try {
      const rawSnyk = JSON.parse(fs.readFileSync(snykReportPath, 'utf8'));
      staticAnalysisReports.snyk = {
        uniqueCount: rawSnyk.uniqueCount,
        vulnerabilities: (rawSnyk.vulnerabilities || []).slice(0, 15).map((v) => ({
          title: v.title,
          severity: v.severity,
          packageName: v.packageName,
          version: v.version,
          identifiers: v.identifiers
        }))
      };
    } catch (err) {
      console.warn('Could not parse snyk-report.json:', err.message);
    }
  }

  const gitleaksReportPath = path.join(repoRoot, 'gitleaks-report.json');
  if (fs.existsSync(gitleaksReportPath)) {
    try {
      const rawGitleaks = JSON.parse(fs.readFileSync(gitleaksReportPath, 'utf8'));
      if (Array.isArray(rawGitleaks) && rawGitleaks.length > 0) {
        staticAnalysisReports.secret_leaks = rawGitleaks.slice(0, 15).map((leak) => ({
          file: leak.File,
          line: leak.StartLine,
          ruleID: leak.RuleID,
          description: leak.Description,
          matchRedacted: leak.Secret ? `${leak.Secret.slice(0, 3)}****${leak.Secret.slice(-2)}` : '***'
        }));
      }
    } catch (err) {
      console.warn('Could not parse gitleaks-report.json:', err.message);
    }
  }

  const detectedStack = detectTechStack(repoRoot);

  return {
    prMetadata,
    files: parsedFiles,
    projectDocs,
    sonarRulesConfig,
    staticAnalysisReports,
    detectedStack
  };
}
