#!/usr/bin/env node
/**
 * Migration script: jstree → @mdaemon/folder-tree
 *
 * Usage:
 *   node scripts/migrate-from-jstree.mjs <directory>
 *
 * Phase 1: Scans the directory for jstree usage and prints a checklist of changes.
 * Phase 2: Prompts the user, then applies changes incrementally with explanations.
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { createInterface } from 'node:readline';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SCANNABLE_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.html', '.htm', '.vue', '.svelte',
  '.css', '.scss', '.sass', '.less',
  '.json',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
]);

/**
 * Ordered list of replacement rules. Most specific rules MUST come first so they
 * transform text before the general-purpose rules run on the same line.
 */
const RULES = [
  // --- Most specific: jQuery API transforms (must precede root-class) ---
  {
    id: 'jquery-init',
    pattern: /\$\(([^)]+)\)\.jstree\(/g,
    replacement: 'mdTree($1, ',
    description: 'jQuery init: $(...).jstree(...) → mdTree(..., ...)',
  },
  {
    id: 'jquery-event',
    pattern: /\.on\(\s*(['"`])([^'"`]+)\.jstree\1/g,
    replacement: '.addEventListener($1$2.MDFolderTree$1',
    description: 'Event binding: .on("event.jstree" → .addEventListener("event.MDFolderTree"',
  },
  {
    id: 'jquery-off',
    pattern: /\.off\(\s*(['"`])([^'"`]+)\.jstree\1/g,
    replacement: '.removeEventListener($1$2.MDFolderTree$1',
    description: 'Event unbinding: .off("event.jstree" → .removeEventListener("event.MDFolderTree"',
  },
  // --- Data attribute (before css-class since "data-jstree" contains "jstree-") ---
  {
    id: 'data-attr',
    pattern: /data-jstree/g,
    replacement: 'data-md-tree',
    description: 'Data attribute: data-jstree → data-md-tree',
  },
  // --- CSS class with hyphen suffix ---
  {
    id: 'css-class',
    pattern: /\bjstree-/g,
    replacement: 'md-tree-',
    description: 'CSS class prefix: jstree-* → md-tree-*',
  },
  // --- Standalone "jstree" (least specific, runs last) ---
  {
    id: 'root-class',
    // Match standalone "jstree" as a class name — surrounded by quotes, spaces, commas, or dots
    // but NOT when preceded by "data-" (already handled) or followed by a hyphen (already handled)
    pattern: /(?<=["'`\s,.])jstree(?=["'`\s,.])/g,
    replacement: 'md-tree',
    description: 'Root CSS class: .jstree → .md-tree',
  },
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function walkDir(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        results.push(...await walkDir(fullPath));
      }
    } else if (entry.isFile() && SCANNABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Phase 1: Scan and report
// ---------------------------------------------------------------------------

/**
 * Returns an array of findings: { file, line, column, lineContent, rule }
 */
async function scanFile(filePath) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    for (const rule of RULES) {
      // Reset regex state
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(lineText)) !== null) {
        findings.push({
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          lineContent: lineText,
          rule,
          matchText: match[0],
        });
      }
    }
  }
  return findings;
}

function printChecklist(findings, baseDir) {
  if (findings.length === 0) {
    console.log('\n✅ No jstree references found — nothing to migrate!\n');
    return;
  }

  // Group by file
  const byFile = new Map();
  for (const f of findings) {
    const rel = relative(baseDir, f.file);
    if (!byFile.has(rel)) byFile.set(rel, []);
    byFile.get(rel).push(f);
  }

  // Group by rule for summary
  const byRule = new Map();
  for (const f of findings) {
    if (!byRule.has(f.rule.id)) byRule.set(f.rule.id, []);
    byRule.get(f.rule.id).push(f);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  MIGRATION CHECKLIST: jstree → @mdaemon/folder-tree');
  console.log('═'.repeat(70));
  console.log(`\n  Found ${findings.length} change(s) across ${byFile.size} file(s).\n`);

  // Summary by rule type
  console.log('  SUMMARY BY CHANGE TYPE:');
  console.log('  ' + '─'.repeat(50));
  for (const rule of RULES) {
    const count = byRule.get(rule.id)?.length ?? 0;
    if (count > 0) {
      console.log(`  [ ] ${rule.description} (${count} occurrence${count > 1 ? 's' : ''})`);
    }
  }

  // Detail by file
  console.log('\n  DETAILS BY FILE:');
  console.log('  ' + '─'.repeat(50));
  for (const [relPath, fileFindings] of byFile) {
    console.log(`\n  📄 ${relPath} (${fileFindings.length} change${fileFindings.length > 1 ? 's' : ''})`);
    for (const f of fileFindings) {
      const trimmed = f.lineContent.trim();
      const preview = trimmed.length > 80 ? trimmed.slice(0, 77) + '...' : trimmed;
      console.log(`     Line ${String(f.line).padStart(4)}: [${f.rule.id}] ${preview}`);
    }
  }
  console.log('\n' + '═'.repeat(70) + '\n');
}

// ---------------------------------------------------------------------------
// Phase 2: Apply changes
// ---------------------------------------------------------------------------

async function applyChanges(findings, baseDir) {
  // Group by file to process each file once
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }

  let totalApplied = 0;

  for (const [filePath, fileFindings] of byFile) {
    const relPath = relative(baseDir, filePath);
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    let changeCount = 0;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Processing: ${relPath}`);
    console.log('─'.repeat(60));

    // Apply replacements line by line
    for (let i = 0; i < lines.length; i++) {
      const originalLine = lines[i];
      let modifiedLine = originalLine;

      // Apply all rules to this line
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(modifiedLine)) {
          rule.pattern.lastIndex = 0;
          modifiedLine = modifiedLine.replace(rule.pattern, rule.replacement);
        }
      }

      if (modifiedLine !== originalLine) {
        changeCount++;
        totalApplied++;
        console.log(`  Line ${i + 1}:`);
        console.log(`    - ${originalLine.trim()}`);
        console.log(`    + ${modifiedLine.trim()}`);
        console.log(`    ↳ ${identifyChanges(originalLine, modifiedLine)}`);
        lines[i] = modifiedLine;
      }
    }

    // Write back
    await writeFile(filePath, lines.join('\n'), 'utf-8');
    console.log(`  ✅ Saved (${changeCount} line${changeCount > 1 ? 's' : ''} modified)`);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Migration complete! ${totalApplied} line${totalApplied > 1 ? 's' : ''} modified across ${byFile.size} file${byFile.size > 1 ? 's' : ''}.`);
  console.log('═'.repeat(60));
  console.log('\n  Next steps:');
  console.log('  1. Remove jQuery and jstree from your dependencies');
  console.log('  2. Install @mdaemon/folder-tree:  npm install @mdaemon/folder-tree');
  console.log('  3. Import the stylesheet:  import "@mdaemon/folder-tree/styles.css"');
  console.log('  4. Replace jstree script tags with the UMD bundle or ESM import');
  console.log('  5. Update event handlers to read from e.detail instead of callback data arg');
  console.log('  6. Test your application\n');
}

function identifyChanges(original, modified) {
  const applied = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(original)) {
      applied.push(rule.description);
    }
    rule.pattern.lastIndex = 0;
  }
  return applied.join('; ');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const targetDir = process.argv[2];

  if (!targetDir) {
    console.error('Usage: node scripts/migrate-from-jstree.mjs <directory>');
    console.error('');
    console.error('Example: node scripts/migrate-from-jstree.mjs ./src');
    process.exit(1);
  }

  // Resolve and validate
  const resolvedDir = join(process.cwd(), targetDir);
  try {
    const s = await stat(resolvedDir);
    if (!s.isDirectory()) {
      console.error(`Error: "${targetDir}" is not a directory.`);
      process.exit(1);
    }
  } catch {
    console.error(`Error: "${targetDir}" does not exist.`);
    process.exit(1);
  }

  console.log(`\nScanning: ${resolvedDir}\n`);

  // Phase 1: Scan
  const files = await walkDir(resolvedDir);
  console.log(`Found ${files.length} scannable file(s)...`);

  const allFindings = [];
  for (const file of files) {
    const findings = await scanFile(file);
    allFindings.push(...findings);
  }

  printChecklist(allFindings, resolvedDir);

  if (allFindings.length === 0) {
    process.exit(0);
  }

  // Phase 2: Ask and apply
  const answer = await ask('Would you like the script to apply these changes? (yes/no): ');

  if (answer === 'yes' || answer === 'y') {
    await applyChanges(allFindings, resolvedDir);
  } else {
    console.log('\nNo changes made. You can re-run the script when ready.\n');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
