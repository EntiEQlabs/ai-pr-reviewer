import { GoogleGenAI } from '@google/genai';

const SYSTEM_INSTRUCTION = `
You are an elite Principal Software Engineer, Lead Security Auditor & SonarQube Quality Profile Reviewer.

### FIRST PRIORITY: STRICT SONARQUBE RULES, QUALITY PROFILE TAXONOMY & PERFORMANCE

You must evaluate all code strictly against SonarQube Quality Gate standards, base "Sonar way" rules, security vulnerabilities, startup performance, and project-specific Custom Extra Rules:

1. SONARQUBE BUGS & RELIABILITY:
   - Identical Branches: Conditional operations must not return or execute the same logic in all branches (\`sonarjs/no-all-duplicated-branches\`, S1871, S3923).
   - Identical Expressions & Conditions: Identical expressions on both sides of binary operators (e.g. \`a === a\`, \`x && x\`) or duplicate condition branches in if/else-if or switch statements (\`sonarjs/no-identical-expressions\`, \`sonarjs/no-identical-conditions\`, S1764, S1862).
   - Unthrown Errors: Instances of \`Error\` or \`Exception\` instantiated without being thrown or returned (\`sonarjs/no-unthrown-error\`, S3984).
   - Ignored Returns: Ignoring return values of pure, immutable, or state-returning methods (\`sonarjs/no-ignored-return\`, S2201).
   - Unhandled Promises & Futures: Missing \`await\`, unhandled Promise/Future rejections, or missing error callbacks.
   - Useless Catch & Swallowed Exceptions: Empty catch blocks (\`catch (e) {}\`), catches that only rethrow without handling (\`sonarjs/no-useless-catch\`, S2737), or errors swallowed without logging to telemetry/logger (\`custom/proper-error-handling\`).
   - Operator Typos & Useless Increments: Assignment typos like \`=-\` or \`=+\` (\`sonarjs/non-existent-operator\`, S2757) and useless post-increments in returns like \`return count++;\` (\`sonarjs/no-useless-increment\`, S2123).
   - Null / Undefined Dereferencing and uncalled callbacks.

2. FLUTTER & MOBILE ARCHITECTURAL INTEGRITY:
   - BuildContext Across Async Gaps: Flag any usage of \`BuildContext\` (e.g. \`Navigator.of(context)\`, \`ScaffoldMessenger.of(context)\`, \`Theme.of(context)\`) following an \`await\` call without an explicit \`if (!context.mounted) return;\` or \`if (!mounted) return;\` guard (\`custom/flutter-use-build-context-synchronously\`).
   - Startup Over-Initialization: Flag heavy, sequential, or blocking \`await\` calls in \`void main() async\` before \`runApp()\` (\`custom/no-blocking-main-thread-initialization\`). Defer non-critical SDKs (Analytics, Sentry, AdMob, Crashlytics, heavy DB warmups) until after the first frame renders (\`WidgetsBinding.instance.addPostFrameCallback\`).
   - Main Isolate CPU Offloading: Flag CPU-intensive parsing, large JSON decoding, crypto, or image manipulation running on the main UI isolate without \`compute()\` or \`Isolate.run()\` (\`custom/flutter-isolate-heavy-computations\`).
   - Const Constructors: Enforce \`const\` constructors on immutable widget subtrees to eliminate unnecessary widget tree rebuilds (\`custom/flutter-const-widgets\`).
   - Controller & Stream Leak Prevention: Flag missing \`.dispose()\` on \`AnimationController\`, \`TextEditingController\`, \`ScrollController\`, \`PageController\`, \`FocusNode\`, and uncancelled \`StreamSubscription\` instances (\`custom/flutter-dispose-controllers\`).
   - Secure Credential Storage: Prohibit storing JWT tokens, refresh tokens, and passwords in plain \`SharedPreferences\`; require hardware-backed encrypted storage (\`flutter_secure_storage\`) (\`custom/flutter-secure-storage-for-tokens\`).

3. SONARQUBE VULNERABILITIES, SECURITY & INFORMATION DISCLOSURE:
   - Broken Object Level Authorization (BOLA / IDOR - OWASP API #1): Endpoints accessing or modifying resources by ID must verify tenant / user ownership. Flag missing authorization ownership checks (\`[CustomRule: custom/bola-idor-authorization]\`).
   - Secret Leaks & Hardcoded Credentials: (reported in \`secret_leaks\` or found in diff): Any hardcoded API keys, private tokens, DB passwords, AWS secrets, or bearer tokens MUST be flagged as CRITICAL severity (\`[Secret Leak: Gitleaks]\` / \`sonarjs/no-hardcoded-credentials\`). Instruct developer to rotate/revoke secrets immediately. NEVER print plaintext secrets in comments.
   - Information Exposure Through Error Messages (CWE-209 / OWASP A05:2021): Prohibit exposing raw error objects, technical exceptions, database stack traces, or internal server paths directly to end users in UI components (Flutter \`SnackBar\`, \`showDialog\`, \`showModalBottomSheet\`, \`Toast\`, React alerts/toasts) or in raw backend API 500 responses (e.g., \`e.toString()\`, \`ex.Message\`, \`DioException\`, \`FirebaseException\`, \`SqlException\`, \`StatusCode(500, ex.ToString())\`). Require mapped, user-friendly, localized error feedback (\`custom/no-raw-exception-in-ui\`, \`custom/safe-api-error-responses\`).
   - SQL Injection: Raw SQL string concatenation or unparameterized queries (\`sonarjs/sql-injection-risk\`, S2077, S3649).
   - Insecure Randomness: Using pseudorandom generators (\`Math.random()\`, \`Random()\`) for tokens, crypto, or session IDs instead of cryptographically secure RNGs (\`sonarjs/no-insecure-randomness\`, S2245).
   - Path Traversal & SSRF: Unsanitized user inputs in file paths (\`sonarjs/path-traversal-prevention\`, CWE-22) or unvalidated outbound HTTP client URLs (\`sonarjs/secure-ssrf-prevention\`, CWE-918).
   - ReDoS / Unsafe Regular Expressions: Regular expressions vulnerable to exponential backtracking (\`sonarjs/no-unsafe-regex\`, S5852).
   - Reverse Tabnabbing: External \`target="_blank"\` links without \`rel="noopener noreferrer"\` (\`custom/secure-external-links\`).
   - XSS & Insecure Embeds: Insecure raw HTML injection, unsanitized innerHTML, or unsafe iframe embedding.
   - Dynamic Code Execution: Prohibit \`eval()\`, \`new Function()\`, and dynamic code injection (\`sonarjs/no-eval-or-unsafe-code-execution\`, S1523).
   - Insecure Third-Party Packages: Vulnerabilities reported in dependency audits (\`npm_audit\`, \`snyk\`).

4. BACKEND, DATABASE & RUNTIME ARCHITECTURE (.NET / PYTHON / NODE / GO):
   - N+1 Database Queries: Prohibit executing database queries or lazy navigation properties inside loops (EF Core, Prisma, TypeORM, Django). Require eager loading (\`.Include()\`, batch joins) (\`custom/no-n-plus-one-queries\`).
   - Unbounded Database & API Queries: Prohibit database queries without explicit pagination or take limits (\`limit\`, \`.Take(n)\`). Unbounded table scans cause OOM crashes under scale (\`custom/unbounded-database-queries\`).
   - C# / .NET Avoid Sync-Over-Async: Calling \`.Result\`, \`.Wait()\`, or \`.GetAwaiter().GetResult()\` on Tasks causes thread pool starvation and deadlocks. Require \`await\` (\`custom/dotnet-no-sync-over-async\`).
   - CancellationToken Propagation: Require passing \`CancellationToken\` through async controller actions to database/HTTP operations to avoid orphaned compute (\`custom/dotnet-cancellation-token-propagation\`).
   - Disposable Resource Management: Types implementing \`IDisposable\` or \`IAsyncDisposable\` must use \`using var\` or \`await using\` (\`custom/dotnet-idisposable-using\`, S2930).
   - Python / Backend: Unclosed database sessions/connections, missing input validation on API schemas (Pydantic/marshmallow).
   - Go / Backend: Unchecked error returns (\`if err != nil\`), goroutine leaks without context cancellation.

5. FRONTEND & STATE MANAGEMENT INTEGRITY (FLUTTER / REACT / NEXT.JS):
   - Immutable State Updates: Prohibit direct in-place mutation of state objects or arrays (e.g. \`state.items.push()\`, or direct mutations on Flutter Bloc/Riverpod state instances). Must return new immutable copies with \`copyWith()\` or spread operators (\`custom/immutable-state-updates\`).
   - Async Race Condition Guard: Form submissions, payments, and search queries must implement loading locks or debouncing to prevent double-submit bugs and race conditions (\`custom/async-race-condition-guard\`).
   - React Hook Dependencies: Missing dependencies in \`useEffect\`, \`useCallback\`, or \`useMemo\` dependency arrays causing stale closures (\`custom/react-hook-exhaustive-deps\`).
   - Array Index as Key: Prohibit \`key={index}\` on dynamic, reorderable, or filterable lists (\`custom/react-no-array-index-as-key\`).
   - Effect Cleanup: Missing cleanup return functions in \`useEffect\` for timers, listeners, animations, or subscriptions (\`custom/react-cleanup-effect\`).
   - Next.js Images: Missing \`width\`/\`height\` or \`fill\` with \`sizes\` on \`<Image />\` causing CLS layout shift.
   - Client Boundary Standards: Missing \`"use client"\` directive on interactive components using hooks or browser events.

6. SONARQUBE CODE SMELLS, MAINTAINABILITY & DESIGN TOKENS:
   - Dead Stores: Variables or parameters declared or assigned but never used (\`sonarjs/no-dead-store\`, \`sonarjs/no-unused-vars\`, S1854, S1481).
   - Cognitive Complexity: Functions exceeding cognitive complexity of 15 (\`sonarjs/cognitive-complexity\`, S3776).
   - Nested Ternaries: Unreadable nested conditional ternary operators (\`sonarjs/no-nested-conditional\`, S3358).
   - Duplicate Strings: String literals duplicated 3+ or 4+ times (\`sonarjs/no-duplicate-string\`, S1192).
   - Redundant Logic: Redundant jump statements (\`sonarjs/no-redundant-jump\`), collapsible ifs (\`sonarjs/no-collapsible-if\`), and gratuitous boolean expressions (\`sonarjs/no-gratuitous-expressions\`).
   - Commented-out Code: Blocks of dead commented-out code (\`sonarjs/no-commented-code\`, S125).
   - Zero Hardcoded Color Hex Codes: Prohibit raw hex codes in JSX/Flutter styles when design tokens exist (\`custom/no-hardcoded-hex-colors\`).
   - Semantic HTML & WCAG 2.1 AA: Interactive button/link semantics, missing \`aria-label\`, missing image \`alt\` descriptions.

### STRICT INSTRUCTIONS:
- MANDATORY EXHAUSTIVE AUDIT: You must perform a complete, exhaustive line-by-line audit across EVERY single modified file. DO NOT stop after 3-5 findings or summarize issues. If there are 15 distinct issues or anti-patterns across the diff, you MUST return all 15 findings in the \`findings\` array.
- LINE NUMBER ACCURACY: Anchor every finding strictly to one of the provided "Valid modified line numbers in new file". If an issue spans multiple lines, choose the exact changed line where the code or call is introduced.
- Whenever static SonarQube findings (\`sonar_rules\`), secret leaks (\`secret_leaks\`), or custom rules are provided in the context, you MUST analyze, validate, and report them with the exact rule identifier (e.g., \`[SonarQube: sonarjs/no-all-duplicated-branches]\`, \`[Secret Leak: Gitleaks]\`, \`[CustomRule: custom/flutter-use-build-context-synchronously]\`, \`[CustomRule: custom/no-blocking-main-thread-initialization]\`, \`[CustomRule: custom/no-raw-exception-in-ui]\`, or \`[CustomRule: custom/no-hardcoded-hex-colors]\`).
- Be strict and uncompromising on code reliability, security, startup performance, error handling, accessibility, and design system token consistency.
- Always provide exact file paths, valid diff line numbers, and actionable remediation code snippets.
`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'object',
      properties: {
        risk_level: {
          type: 'string',
          enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
        },
        recommendation: {
          type: 'string',
          enum: ['APPROVE', 'COMMENT', 'REQUEST_CHANGES']
        },
        overview: {
          type: 'string',
          description: 'A 2-3 sentence executive summary of the changes, architectural impact, and overall quality.'
        },
        critical_count: { type: 'integer' },
        high_count: { type: 'integer' },
        medium_count: { type: 'integer' },
        low_count: { type: 'integer' }
      },
      required: [
        'risk_level',
        'recommendation',
        'overview',
        'critical_count',
        'high_count',
        'medium_count',
        'low_count'
      ]
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: {
            type: 'string',
            enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
          },
          category: {
            type: 'string',
            enum: ['CORRECTNESS', 'SECURITY', 'PERFORMANCE', 'ARCHITECTURE', 'BUSINESS_LOGIC', 'EDGE_CASE']
          },
          issue_type: {
            type: 'string',
            enum: ['DEFINITE_ISSUE', 'POTENTIAL_BUSINESS_IMPACT']
          },
          title: { type: 'string', description: 'Concise summary of the finding (under 10 words).' },
          description: { type: 'string', description: 'Detailed explanation of why this is a problem and what failure mode occurs.' },
          recommendation: { type: 'string', description: 'Concrete remediation steps, including code snippets where appropriate.' },
          confidence: { type: 'number', description: 'Confidence score between 0.0 and 1.0.' }
        },
        required: [
          'file',
          'line',
          'severity',
          'category',
          'issue_type',
          'title',
          'description',
          'recommendation',
          'confidence'
        ]
      }
    }
  },
  required: ['summary', 'findings']
};

/**
 * Priority scoring for files so security, logic, and core services are reviewed first
 */
function getFilePriority(filePath) {
  if (/auth|security|payment|api|token|secret/i.test(filePath)) return 10;
  if (/controller|service|provider|repository|route/i.test(filePath)) return 8;
  if (/main\.(dart|ts|js)|Program\.cs|App\.(tsx|jsx)/i.test(filePath)) return 7;
  if (/\.(ts|tsx|js|jsx|dart|cs|py|go|java|kt|rs)$/i.test(filePath)) return 6;
  if (/\.(sql|prisma|schema)$/i.test(filePath)) return 5;
  if (/\.(json|yaml|yml|css|scss)$/i.test(filePath)) return 2;
  return 1;
}

/**
 * Formats SonarQube profile, security, and custom rules for prompt inclusion
 */
function formatSonarRules(sonarRulesConfig) {
  if (!sonarRulesConfig) return '';

  let section = `## SonarQube Quality Profile & Active Rule Standards\n`;
  if (sonarRulesConfig.profile) {
    section += `**Quality Profile**: ${sonarRulesConfig.profile.name || 'Enterprise Profile'} (Extends: \`${sonarRulesConfig.profile.extends || 'Sonar way'}\`)\n\n`;
  }

  if (sonarRulesConfig.baseRules && Object.keys(sonarRulesConfig.baseRules).length > 0) {
    section += `### 1. Base "Sonar way" Clean Code Rules:\n`;
    for (const [ruleId, info] of Object.entries(sonarRulesConfig.baseRules)) {
      section += `- **\`${ruleId}\`** [Severity: ${info.severity || 'HIGH'}]: ${info.description}\n`;
    }
    section += '\n';
  }

  if (sonarRulesConfig.securityRules && Object.keys(sonarRulesConfig.securityRules).length > 0) {
    section += `### 2. SonarQube Security & OWASP Standards:\n`;
    for (const [ruleId, info] of Object.entries(sonarRulesConfig.securityRules)) {
      section += `- **\`${ruleId}\`** [Severity: ${info.severity || 'CRITICAL'}]: ${info.description}\n`;
    }
    section += '\n';
  }

  if (Array.isArray(sonarRulesConfig.customRules) && sonarRulesConfig.customRules.length > 0) {
    section += `### 3. Custom Extra Rules Overlay (ENFORCE UNCOMPROMISINGLY):\n`;
    for (const rule of sonarRulesConfig.customRules) {
      section += `- **\`${rule.id}\`** (${rule.name}) [Severity: ${rule.severity || 'HIGH'}]: ${rule.description} (Tags: ${(rule.tags || []).join(', ')})\n`;
    }
    section += '\n';
  }

  return section;
}

/**
 * Builds the comprehensive prompt for Gemini with intelligent truncation for large PRs
 */
function buildPrompt(context) {
  const { prMetadata, files, projectDocs, staticAnalysisReports, sonarRulesConfig } = context;

  let prompt = `# Pull Request Review Context\n\n`;
  prompt += `## PR Title: ${prMetadata.title || 'N/A'}\n`;
  prompt += `## Base Branch: ${prMetadata.baseRef} | Head Branch: ${prMetadata.headRef}\n`;
  if (prMetadata.body) {
    prompt += `## PR Description:\n${prMetadata.body}\n\n`;
  }

  if (sonarRulesConfig) {
    prompt += formatSonarRules(sonarRulesConfig);
  }

  if (Object.keys(projectDocs).length > 0) {
    prompt += `## Project Documentation & Guidelines:\n`;
    for (const [docName, content] of Object.entries(projectDocs)) {
      prompt += `### ${docName}\n\`\`\`markdown\n${content}\n\`\`\`\n\n`;
    }
  }

  if (Object.keys(staticAnalysisReports).length > 0) {
    prompt += `## Static Analysis Findings (Linters / SonarQube):\n\`\`\`json\n${JSON.stringify(staticAnalysisReports, null, 2)}\n\`\`\`\n\n`;
  }

  // Sort files by priority
  const sortedFiles = [...files].sort((a, b) => getFilePriority(b.newPath) - getFilePriority(a.newPath));

  prompt += `## Changed Files and Unified Diffs (${sortedFiles.length} files total):\n`;
  
  // Cap total prompt diff size if dealing with massive multi-file bootstrap PRs
  let currentDiffLength = 0;
  const MAX_TOTAL_DIFF_CHARS = 180000; // ~45k tokens

  for (const file of sortedFiles) {
    if (currentDiffLength >= MAX_TOTAL_DIFF_CHARS) {
      prompt += `\n> [!NOTE]\n> Remaining ${sortedFiles.length - sortedFiles.indexOf(file)} low-priority files omitted due to PR size.\n`;
      break;
    }

    let patch = file.patch || '';
    if (patch.length > 15000) {
      patch = patch.slice(0, 15000) + '\n... [diff truncated for size]';
    }

    currentDiffLength += patch.length;

    prompt += `### File: ${file.newPath} (${file.isNew ? 'NEW' : file.isDeleted ? 'DELETED' : 'MODIFIED'})\n`;
    prompt += `Valid modified line numbers in new file: [${file.changedLines.slice(0, 100).join(', ')}${file.changedLines.length > 100 ? '...' : ''}]\n`;
    prompt += `\`\`\`diff\n${patch}\n\`\`\`\n\n`;
  }

  return prompt;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call model with exponential backoff for transient 503/429/500 errors
 */
async function callModelWithRetry(ai, modelName, prompt, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Calling model '${modelName}' (attempt ${attempt}/${maxRetries})...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.1
        }
      });
      return response;
    } catch (err) {
      lastError = err;
      const status = err.status || err.statusCode || (err.error && err.error.code);
      const isTransient =
        status === 503 ||
        status === 429 ||
        status === 500 ||
        err.message?.includes('high demand') ||
        err.message?.includes('UNAVAILABLE') ||
        err.message?.includes('RESOURCE_EXHAUSTED');

      if (isTransient && attempt < maxRetries) {
        const delayMs = Math.min(attempt * 3000 + Math.random() * 1000, 15000);
        console.warn(`⚠️ Model '${modelName}' returned status ${status || 'TRANSIENT'}. Retrying in ${Math.round(delayMs)}ms...`);
        await sleep(delayMs);
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

/**
 * Executes Gemini review analysis using structured JSON output with retries and fallbacks
 */
export async function analyzePullRequest(context, apiKey) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(context);

  console.log('Sending PR context to Google Gemini for reasoning and structured review...');

  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const candidateModels = Array.from(
    new Set([
      primaryModel,
      'gemini-2.5-pro',
      'gemini-1.5-pro',
      'gemini-1.5-flash'
    ])
  );

  let response;
  let usedModel;
  let lastErr;

  for (const modelName of candidateModels) {
    try {
      response = await callModelWithRetry(ai, modelName, prompt, 3);
      usedModel = modelName;
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`⚠️ Model '${modelName}' unavailable: ${err.message}. Trying next candidate model...`);
    }
  }

  if (!response) {
    throw new Error(`All candidate Gemini models failed. Last error: ${lastErr?.message}`);
  }

  console.log(`✅ Received analysis from model: '${usedModel}'`);

  const responseText = response.text;
  if (!responseText) {
    throw new Error('Gemini returned an empty response.');
  }

  let result;
  try {
    result = JSON.parse(responseText);
  } catch (err) {
    console.error('Failed to parse Gemini JSON output:', responseText);
    throw new Error(`Invalid JSON from Gemini: ${err.message}`);
  }

  // Double check counts
  if (result.findings) {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const f of result.findings) {
      if (counts[f.severity] !== undefined) {
        counts[f.severity]++;
      }
    }
    result.summary.critical_count = counts.CRITICAL;
    result.summary.high_count = counts.HIGH;
    result.summary.medium_count = counts.MEDIUM;
    result.summary.low_count = counts.LOW;
  }

  return result;
}

