import fs from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";

const WORKSPACE_ROOT = process.cwd();

const readText = async (rel) => {
  const p = path.resolve(WORKSPACE_ROOT, rel);
  return fs.readFile(p, "utf8");
};

const uniq = (arr) => Array.from(new Set(arr));

function parseTs(rel, text) {
  return ts.createSourceFile(
    rel,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
}

function getLine(sf, node) {
  const lc = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return lc.line + 1;
}

function extractParamSchemaGroups(sf) {
  const groups = [];
  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = node.name;
      const key = ts.isIdentifier(name)
        ? name.text
        : ts.isStringLiteral(name)
          ? name.text
          : null;
      if (key === "group") {
        const init = node.initializer;
        if (
          ts.isStringLiteral(init) ||
          ts.isNoSubstitutionTemplateLiteral(init)
        ) {
          groups.push(init.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return uniq(groups);
}

function extractInspectorGroupScopeRules(sf) {
  /** @type {{prefix:string, scope:string, line:number}[]} */
  const rules = [];

  const extractPrefix = (expr) => {
    if (!ts.isCallExpression(expr)) return null;
    if (!ts.isPropertyAccessExpression(expr.expression)) return null;
    if (expr.expression.name.text !== "startsWith") return null;

    const recv = expr.expression.expression;
    if (!ts.isPropertyAccessExpression(recv)) return null;
    if (recv.name.text !== "group") return null;
    if (!ts.isIdentifier(recv.expression) || recv.expression.text !== "def")
      return null;

    const arg0 = expr.arguments[0];
    if (!arg0) return null;
    if (
      !ts.isStringLiteral(arg0) &&
      !ts.isNoSubstitutionTemplateLiteral(arg0)
    )
      return null;
    return arg0.text;
  };

  const extractReturnString = (stmt) => {
    if (!stmt) return null;
    if (ts.isReturnStatement(stmt)) {
      const ex = stmt.expression;
      if (ex && (ts.isStringLiteral(ex) || ts.isNoSubstitutionTemplateLiteral(ex)))
        return ex.text;
      return null;
    }
    if (ts.isBlock(stmt)) {
      for (const s of stmt.statements) {
        if (!ts.isReturnStatement(s)) continue;
        const ex = s.expression;
        if (ex && (ts.isStringLiteral(ex) || ts.isNoSubstitutionTemplateLiteral(ex)))
          return ex.text;
      }
    }
    return null;
  };

  const visit = (node) => {
    if (ts.isIfStatement(node)) {
      const prefix = extractPrefix(node.expression);
      if (prefix) {
        const scope = extractReturnString(node.thenStatement);
        if (scope) rules.push({ prefix, scope, line: getLine(sf, node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return rules;
}

function extractBootstrapScopeWriters(sf) {
  const scopes = new Set();
  const scopePrefixes = new Set();

  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    ) {
      const l = node.left;
      const r = node.right;
      const isScopeId = (x) => ts.isIdentifier(x) && x.text === "scope";
      const isString = (x) =>
        ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x);

      if (isScopeId(l) && isString(r)) scopes.add(r.text);
      if (isScopeId(r) && isString(l)) scopes.add(l.text);
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const recv = node.expression.expression;
      const name = node.expression.name.text;
      if (name === "startsWith" && ts.isIdentifier(recv) && recv.text === "scope") {
        const arg0 = node.arguments[0];
        if (arg0 && (ts.isStringLiteral(arg0) || ts.isNoSubstitutionTemplateLiteral(arg0))) {
          scopePrefixes.add(arg0.text);
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
  return {
    scopes: Array.from(scopes).sort(),
    scopePrefixes: Array.from(scopePrefixes).sort(),
  };
}

function computeShadowedRules(rules) {
  const shadowed = [];
  for (let i = 0; i < rules.length; i++) {
    const a = rules[i];
    for (let j = i + 1; j < rules.length; j++) {
      const b = rules[j];
      if (b.prefix.startsWith(a.prefix) && b.prefix !== a.prefix) {
        shadowed.push({ earlier: a, later: b });
      }
    }
  }
  return shadowed;
}

function toReport({
  groups,
  rules,
  uncoveredGroups,
  scopesUsed,
  missingWriterScopes,
  shadowedRules,
  bootstrapWriters,
}) {
  const lines = [];
  lines.push("# Dataflow Audit (paramSchema -> Inspector scope -> applyInspectorPatch)");
  lines.push("");
  lines.push(`- groups (paramSchema): ${groups.length}`);
  lines.push(`- mapping rules (inspectorController getScopeForDef): ${rules.length}`);
  lines.push(`- scopes used by groups: ${scopesUsed.length}`);
  lines.push(`- uncovered groups: ${uncoveredGroups.length}`);
  lines.push(`- missing writer scopes: ${missingWriterScopes.length}`);
  lines.push("");

  lines.push("## Bootstrap writer coverage");
  lines.push(`- handled literal scopes: ${bootstrapWriters.scopes.length}`);
  lines.push(`- handled scope prefixes: ${bootstrapWriters.scopePrefixes.length}`);
  lines.push("");

  if (uncoveredGroups.length) {
    lines.push("## Uncovered groups (paramSchema group has no Inspector scope rule)");
    for (const g of uncoveredGroups) lines.push(`- ${g}`);
    lines.push("");
  }

  if (missingWriterScopes.length) {
    lines.push("## Missing writer scopes (Inspector can emit, bootstrap does not handle)");
    for (const s of missingWriterScopes) lines.push(`- ${s.scope} (groups: ${s.groupsCount})`);
    lines.push("");
  }

  lines.push("## Scope summary (used)");
  for (const s of scopesUsed) lines.push(`- ${s.scope}: ${s.groupsCount}`);
  lines.push("");

  lines.push("## Mapping rules (order matters)");
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    lines.push(`- ${i + 1}. "${r.prefix}" -> ${r.scope} (inspectorController.ts:${r.line})`);
  }
  lines.push("");

  if (shadowedRules.length) {
    lines.push("## Rule issues (potential shadowing)");
    for (const s of shadowedRules) {
      lines.push(`- "${s.earlier.prefix}" -> ${s.earlier.scope} shadows "${s.later.prefix}" -> ${s.later.scope}`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

async function main() {
  const [paramSchemaText, inspectorText, bootstrapText] = await Promise.all([
    readText("src/state/paramSchema.ts"),
    readText("src/app/controllers/inspectorController.ts"),
    readText("src/app/bootstrap.ts"),
  ]);

  const paramSf = parseTs("paramSchema.ts", paramSchemaText);
  const inspectorSf = parseTs("inspectorController.ts", inspectorText);
  const bootstrapSf = parseTs("bootstrap.ts", bootstrapText);

  const groups = extractParamSchemaGroups(paramSf).sort((a, b) => a.localeCompare(b));
  const rules = extractInspectorGroupScopeRules(inspectorSf);

  const intentionallyNotInInspector = new Set(["Global/Macros"]);

  const resolveScopeForGroup = (group) => {
    for (const r of rules) {
      if (group.startsWith(r.prefix)) return r.scope;
    }
    return null;
  };

  const uncoveredGroups = [];
  const scopeToGroups = new Map();
  for (const g of groups) {
    if (intentionallyNotInInspector.has(g)) continue;
    const scope = resolveScopeForGroup(g);
    if (!scope) {
      uncoveredGroups.push(g);
      continue;
    }
    const arr = scopeToGroups.get(scope) ?? [];
    arr.push(g);
    scopeToGroups.set(scope, arr);
  }

  const scopesUsed = Array.from(scopeToGroups.entries())
    .map(([scope, gs]) => ({ scope, groupsCount: gs.length }))
    .sort((a, b) => b.groupsCount - a.groupsCount || a.scope.localeCompare(b.scope));

  const bootstrapWriters = extractBootstrapScopeWriters(bootstrapSf);
  const isWriterHandled = (scope) =>
    bootstrapWriters.scopes.includes(scope) ||
    bootstrapWriters.scopePrefixes.some((p) => scope.startsWith(p));

  const missingWriterScopes = scopesUsed
    .filter((s) => !isWriterHandled(s.scope))
    .map((s) => ({ scope: s.scope, groupsCount: s.groupsCount }));

  const shadowedRules = computeShadowedRules(rules);

  const outDir = path.resolve(WORKSPACE_ROOT, "artifacts", "audit");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "dataflow-inspector-groups.md");

  const report = toReport({
    groups,
    rules,
    uncoveredGroups,
    scopesUsed,
    missingWriterScopes,
    shadowedRules,
    bootstrapWriters,
  });

  // ASCII-only report to avoid encoding problems on Windows.
  await fs.writeFile(outPath, report, "utf8");

  console.log(
    `[audit-dataflow] groups=${groups.length} rules=${rules.length} scopesUsed=${scopesUsed.length} uncovered=${uncoveredGroups.length} missingWriters=${missingWriterScopes.length}`
  );
  console.log(`[audit-dataflow] report: ${outPath}`);

  if (uncoveredGroups.length) {
    process.exitCode = 2;
  } else if (missingWriterScopes.length) {
    process.exitCode = 3;
  }
}

main().catch((err) => {
  console.error("[audit-dataflow] failed:", String(err?.stack || err || ""));
  process.exitCode = 1;
});
