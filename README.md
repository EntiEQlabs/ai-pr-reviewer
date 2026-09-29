# 🤖 AI PR Reviewer with SonarQube Standards
### Reusable GitHub Action for Automated Pull Request Reviews

An enterprise-grade, automated AI-powered Pull Request reviewer built with **Google Gemini 3.6 Flash** and **SonarQube Quality Profile Standards**. It evaluates PR diffs against deterministic AST linter findings, SonarQube Clean Code taxonomy, security vulnerabilities (OWASP/Snyk), and custom enterprise rules.

---

## 📦 What's Included in this Bundle

```text
ai-pr-reviewer/
├── action.yml                  # GitHub Action manifest (composite runner)
├── default-sonar-rules.json    # Built-in "Sonar way" Base Profile & rules
├── README.md                   # Setup guide (this file)
├── example-workflow.yml        # Workflow to drop into any consumer repo
├── example-sonar-rules.json    # Optional custom rules template
└── review-engine/              # Automated review reasoning engine
    ├── package.json
    ├── package-lock.json
    ├── index.js
    ├── context.js
    ├── analyzer.js
    ├── fingerprint.js
    └── publisher.js
```

---

## 🚀 Setup Guide in 3 Simple Steps

### Step 1: Push this Bundle to a Central GitHub Repository

1. Create a new repository in your GitHub Organization: **`ai-pr-reviewer`** (e.g., `https://github.com/wiates-tech/ai-pr-reviewer`).
2. Extract this ZIP, initialize git inside the folder, and push to your new repo:
   ```bash
   git init
   git add .
   git commit -m "feat: initial release of AI PR reviewer reusable action"
   git branch -M main
   git remote add origin https://github.com/wiates-tech/ai-pr-reviewer.git
   git push -u origin main
   git tag v1
   git push origin v1
   ```

3. **Enable Organization / Internal Access**:
   - Go to your `ai-pr-reviewer` repo on GitHub $\rightarrow$ **Settings** $\rightarrow$ **Actions** $\rightarrow$ **General**.
   - Under **Access**, select: **"Accessible from repositories in the 'wiates-tech' organization"** (if the repository is Private).

---

### Step 2: Configure `GEMINI_API_KEY` ONCE for All Repositories

Instead of adding the secret to each repository individually:

1. Go to your **GitHub Organization Settings**:
   `https://github.com/organizations/wiates-tech/settings/secrets/actions`
2. Click **New organization secret**.
3. Set **Name**: `GEMINI_API_KEY`
4. Set **Value**: *[Your Gemini API Key from Google AI Studio]*
5. Under **Repository access**, select **"All repositories"**.

---

### Step 3: Enable Reviews in Any Project (Takes 30 Seconds!)

In **any repository** (React, Next.js, Node.js, Flutter/Dart, Python, Go, Java, Rust):

1. Create the folder `.github/workflows/`.
2. Add a new file `.github/workflows/ai-review.yml` with the following content (or copy `example-workflow.yml`):

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  ai-review:
    name: AI Pull Request Review
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository with full history
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run AI Reviewer
        uses: wiates-tech/ai-pr-reviewer@v1
        with:
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

*(Note: Standard `GITHUB_TOKEN` is automatically provided by GitHub Actions—no manual setup required!)*

---

## ⚙️ Action Configuration Options

| Input | Description | Required | Default |
| :--- | :--- | :---: | :--- |
| `gemini-api-key` | Google Gemini API Key | **Yes** | — |
| `github-token` | GitHub token for posting PR reviews | No | `${{ github.token }}` |
| `gemini-model` | Google Gemini model name | No | `gemini-3.6-flash` |
| `max-allowed-files` | Maximum changed files allowed before rejecting PR | No | `60` |
| `sonar-rules-path` | Path to custom `sonar-rules.json` file in project | No | `sonar-rules.json` |

---

## 🎯 Custom SonarQube Rules (Optional)

- **Zero Config**: If a project does **not** include a `sonar-rules.json`, the action automatically enforces the built-in **"Sonar way" Base Profile**.
- **Custom Overrides**: If a specific project needs extra custom rules (e.g., zero hardcoded colors, React cleanup rules, Flutter const widgets), add a `sonar-rules.json` to the root of that project (see `example-sonar-rules.json` for reference).

---

## 🛡️ Key Features
- **Deterministic Static Linter Integration**: Reads and merges ESLint, SonarQube, npm audit, Snyk, Flutter analyze, and Ruff outputs.
- **Deduplication Engine**: Uses SHA-256 fingerprinting so subsequent commits on a PR don't re-post duplicate comments.
- **Large PR Guardrail**: Enforces clean, reviewable PR sizes by automatically requesting changes on PRs exceeding file thresholds.
