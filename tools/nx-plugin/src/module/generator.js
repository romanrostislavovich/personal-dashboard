// `nx g @pd/tools:module <name>`: a working module in one command instead of the ten steps of
// docs/architecture.md — the contracts, the client core's requests, the api library (a table, a
// service, a controller), the web library (a page with a list, i18n) and their registration.
// What it cannot know (achievements, Links, AI tools, the README) is printed at the end.
const {
  formatFiles,
  generateFiles,
  joinPathFragments,
  names,
  updateJson,
} = require('@nx/devkit');

/** @param {import('@nx/devkit').Tree} tree */
module.exports = async function moduleGenerator(tree, options) {
  const n = names(options.name);
  const root = `libs/modules/${n.fileName}`;
  if (tree.exists(root)) {
    throw new Error(`${root} exists already`);
  }
  const titleEn = options.titleEn ?? words(n.className);
  const values = {
    ...n,
    tmpl: '',
    titleEn,
    titleRu: options.titleRu ?? titleEn,
    icon: options.icon ?? 'widgets',
    group: options.group ?? 'things',
    tableName: `${n.fileName.replace(/-/g, '_')}_items`,
  };
  const files = joinPathFragments(__dirname, 'files');
  generateFiles(tree, joinPathFragments(files, 'api'), `${root}/api`, values);
  generateFiles(tree, joinPathFragments(files, 'web'), `${root}/web`, values);
  generateFiles(
    tree,
    joinPathFragments(files, 'contracts'),
    'libs/shared/contracts/src/lib',
    values,
  );
  generateFiles(
    tree,
    joinPathFragments(files, 'client'),
    'libs/client/core/src/lib/modules',
    values,
  );

  appendExport(
    tree,
    'libs/shared/contracts/src/index.ts',
    `export * from './lib/${n.fileName}';`,
  );
  appendExport(
    tree,
    'libs/client/core/src/index.ts',
    `export * from './lib/modules/${n.fileName}';`,
  );
  updateJson(tree, 'tsconfig.base.json', json => {
    const paths = json.compilerOptions.paths;
    paths[`@pd/${n.fileName}-api`] = [`./${root}/api/src/index.ts`];
    paths[`@pd/${n.fileName}-web`] = [`./${root}/web/src/index.ts`];
    return json;
  });
  register(tree, 'apps/api/src/modules.ts', {
    line: `import {${n.className}Module} from '@pd/${n.fileName}-api';`,
    listStart: 'export const enabledModules = [',
    entry: `${n.className}Module`,
  });
  register(tree, 'apps/web/src/app/modules.ts', {
    line: `import {${n.propertyName}Module} from '@pd/${n.fileName}-web';`,
    listStart: findWebList(tree),
    entry: `${n.propertyName}Module`,
  });

  await formatFiles(tree);
  return () => {
    console.log(`
The module "${n.fileName}" is in ${root}. Next:
  1. npm run db:generate — the migration of its table (rename it, see the migration skill);
  2. restart npm run dev (the new path aliases are read on start);
  3. the rest of .claude/skills/new-module/SKILL.md: achievements, Links, AI tools, telemetry,
     demo data, the README's table of sections.`);
  };
};

/** "ReadingList" → "Reading list". */
function words(className) {
  const spaced = className.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function appendExport(tree, path, line) {
  const text = tree.read(path, 'utf-8');
  if (!text.includes(line)) {
    tree.write(path, `${text.trimEnd()}\n${line}\n`);
  }
}

/** The import goes after the last import; the entry at the end of the list. */
function register(tree, path, {line, listStart, entry}) {
  let text = tree.read(path, 'utf-8');
  const imports = [...text.matchAll(/^import [^;]+;\n/gm)];
  const afterImports = imports.length
    ? imports[imports.length - 1].index + imports[imports.length - 1][0].length
    : 0;
  text = text.slice(0, afterImports) + line + '\n' + text.slice(afterImports);
  const start = text.indexOf(listStart);
  if (start < 0) {
    throw new Error(`${path}: "${listStart}" not found`);
  }
  const end = text.indexOf('];', start);
  text = `${text.slice(0, end)}  ${entry},\n${text.slice(end)}`;
  tree.write(path, text);
}

/** The array of web modules: `export const … = [` in apps/web/src/app/modules.ts. */
function findWebList(tree) {
  const text = tree.read('apps/web/src/app/modules.ts', 'utf-8');
  const match = text.match(/export const \w+(?::[^=]+)? = \[/);
  if (!match) {
    throw new Error(
      'apps/web/src/app/modules.ts: the list of modules not found',
    );
  }
  return match[0];
}
