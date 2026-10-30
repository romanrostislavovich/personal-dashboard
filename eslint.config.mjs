import nx from '@nx/eslint-plugin';
import {createRequire} from 'node:module';
import tseslint from 'typescript-eslint';

// Google's TypeScript style (gts): its rules, and the formatting by Prettier with Google's settings
// (.prettierrc) reported as lint errors. It is a CommonJS package.
const gts = createRequire(import.meta.url)('gts');
// Only for code: Angular's inline templates are linted as files of their own (`*.html`), which
// gts's whitespace rules break on.
const CODE = ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];
const gtsForCode = gts.map(config =>
  config.files || !Object.keys(config).some(key => key !== 'ignores')
    ? config
    : {...config, files: CODE},
);

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  ...gtsForCode,
  {
    // gts reads the types of one tsconfig.json at the root; in this workspace every project has
    // its own, which the project service finds next to each file.
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: null,
        projectService: {allowDefaultProject: ['*.ts', '*.mts', '*.cts']},
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `_` marks a name kept on purpose: a parameter a signature needs, a field taken out of an
      // object to leave the rest (`const {id: _id, ...rest} = row`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Files no tsconfig includes (the desktop's specs, Playwright's tests, Capacitor's config): no
    // types to read, so the rules that need them are off.
    files: ['apps/desktop/src/**/*.spec.ts', 'apps/mobile/*.ts', 'e2e/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: {project: null, projectService: false},
    },
  },
  {
    // apps/mobile/android: the Android project and the copy of the built web app inside it.
    ignores: [
      '**/dist',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      'apps/mobile/android',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          // Architecture rules (details in docs/architecture.md):
          // - backend and frontend do not import each other; shared code goes only through contracts;
          // - modules depend only on the core and contracts, NEVER on each other;
          // - the client core (plain TypeScript for every client: web, desktop, mobile) knows only
          //   contracts; clients build on it.
          depConstraints: [
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            {
              sourceTag: 'scope:api',
              onlyDependOnLibsWithTags: ['scope:api', 'scope:shared'],
            },
            {
              sourceTag: 'scope:client',
              onlyDependOnLibsWithTags: ['scope:client', 'scope:shared'],
            },
            {
              sourceTag: 'scope:web',
              onlyDependOnLibsWithTags: [
                'scope:web',
                'scope:client',
                'scope:shared',
              ],
            },
            {
              // The browser extension: a client of the client core, like the web app.
              sourceTag: 'scope:extension',
              onlyDependOnLibsWithTags: ['scope:client', 'scope:shared'],
            },
            {
              // The desktop shell is a client too: it checks and cleans the telemetry it sends
              // with the same schemas as the server, and posts to paths of the client core.
              sourceTag: 'scope:desktop',
              onlyDependOnLibsWithTags: ['scope:client', 'scope:shared'],
            },
            {
              // The Android shell has no code of its own: its interface is the web app.
              sourceTag: 'scope:mobile',
              onlyDependOnLibsWithTags: [],
            },
            {
              sourceTag: 'type:core',
              onlyDependOnLibsWithTags: ['type:core', 'type:contracts'],
            },
            {
              sourceTag: 'type:module',
              onlyDependOnLibsWithTags: ['type:core', 'type:contracts'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    rules: {
      // A function with more ways through it than this is hard to read and to test: split it.
      // A warning, not an error — a form of many optional fields (`?? ''`) counts every one.
      complexity: ['warn', {max: 20}],
    },
  },
];
