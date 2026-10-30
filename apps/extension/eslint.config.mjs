import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // The tests are in a tsconfig of their own, which the project service does not read.
    files: ['src/**/*.spec.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: 'tsconfig.spec.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
