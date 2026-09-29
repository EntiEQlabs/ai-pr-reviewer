import path from 'path';
import { fileURLToPath } from 'url';
import { collectContext } from './context.js';
import { analyzePullRequest } from './analyzer.js';
import { publishReview } from './publisher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();
const actionPath = process.env.ACTION_PATH || path.resolve(__dirname, '../');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || process.env.DRY_RUN === 'true';

  let baseRef = null;
  let headRef = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base' && args[i + 1]) baseRef = args[i + 1];
    if (args[i] === '--head' && args[i + 1]) headRef = args[i + 1];
  }

  console.log('🚀 Starting Automated AI PR Review Engine...');
  console.log(`Repository Root: ${repoRoot}`);
  if (process.env.ACTION_PATH) {
    console.log(`Action Path: ${process.env.ACTION_PATH}`);
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!geminiApiKey) {
    if (dryRun) {
      console.warn('⚠️ GEMINI_API_KEY is not set. In dry-run mode, provide GEMINI_API_KEY to test actual AI analysis.');
    } else {
      console.error('❌ Error: GEMINI_API_KEY environment variable is required.');
      process.exit(1);
    }
  }

  try {
    // 1. Collect PR Context and Diff
    const context = await collectContext({
      repoRoot,
      actionPath,
      baseRef,
      headRef
    });

    console.log(`Found ${context.files.length} changed files to analyze.`);

    if (context.files.length === 0) {
      console.log('ℹ️ No changed files detected in this PR/diff. Exiting.');
      process.exit(0);
    }

    // 2. Reject PR immediately if non-asset changed files exceed threshold
    const MAX_ALLOWED_FILES = parseInt(process.env.MAX_ALLOWED_FILES || '60', 10);
    if (context.files.length > MAX_ALLOWED_FILES) {
      console.warn(
        `⛔ PR contains ${context.files.length} changed non-asset files (exceeds limit of ${MAX_ALLOWED_FILES}). Directly rejecting PR.`
      );

      const rejectionResult = {
        summary: {
          risk_level: 'HIGH',
          recommendation: 'REQUEST_CHANGES',
          overview: `⛔ **Pull Request Rejected: Too Many Files Changed (${context.files.length} files)**\n\nThis Pull Request modifies **${context.files.length} non-asset files**, which exceeds the allowable limit of **${MAX_ALLOWED_FILES} files** per PR.\n\n### Why was this PR rejected?\n- Large PRs (>25 files) significantly increase regression risks and reduce review accuracy.\n\n### Action Required:\nPlease decompose this pull request into smaller, focused PRs (e.g., separating components, core logic, and configuration) to proceed with automated AI review.`,
          critical_count: 0,
          high_count: 1,
          medium_count: 0,
          low_count: 0
        },
        findings: []
      };

      await publishReview({
        context,
        analysisResult: rejectionResult,
        githubToken,
        dryRun
      });

      console.log('⛔ PR review rejection submitted directly.');
      process.exit(1);
    }

    // 3. Perform Gemini Reasoning Analysis
    if (!geminiApiKey) {
      console.log('Dry run without Gemini API Key: Context extraction verified successfully.');
      console.log('Files analyzed:', context.files.map((f) => f.newPath));
      return;
    }

    const analysisResult = await analyzePullRequest(context, geminiApiKey);

    // 3. Publish findings to GitHub PR or Terminal
    await publishReview({
      context,
      analysisResult,
      githubToken,
      dryRun
    });

    console.log('🎉 AI PR Review completed successfully.');
  } catch (error) {
    console.error('❌ AI PR Review failed with error:', error);
    process.exit(1);
  }
}

main();
