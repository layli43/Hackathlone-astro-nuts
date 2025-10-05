/** @type {import('stylelint').Config} */
export default {
  extends: [
    'stylelint-config-standard',
    'stylelint-config-css-modules',
    'stylelint-config-recess-order',
    'stylelint-prettier/recommended',
  ],
  rules: {
    'import-notation': 'string', // Use 'string' to import other CSS files, not url()
    'selector-type-no-unknown': null,
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'no-duplicate-selectors': null, // Disable the ban on duplicate selectors so we can define variables separately in CSS Modules
    'block-no-empty': null, // (Normally disallows empty blocks; disabled here)
    'declaration-empty-line-before': 'never',
    'declaration-block-no-duplicate-properties': true, // Disallow duplicate properties within a declaration block
    'declaration-block-no-redundant-longhand-properties': true, // Disallow longhand properties that can be combined into shorthand
    'shorthand-property-no-redundant-values': true, // Disallow redundant values in shorthand properties
    'color-hex-length': 'short', // Prefer short hex colors when possible
    'comment-no-empty': true, // Disallow empty comments
    'font-family-name-quotes': 'always-unless-keyword', // Require quotes around font family names unless they are keywords
    // 'font-weight-notation': 'numeric', // Require numeric (or named when possible) font-weight values
    'function-url-quotes': 'always', // Require quotes around url()
    'property-no-vendor-prefix': true, // Disallow vendor prefixes for properties
    'value-no-vendor-prefix': true, // Disallow vendor prefixes for values
    'selector-no-vendor-prefix': true, // Disallow vendor prefixes for selectors
    'no-descending-specificity': null, // (Normally disallows lower-specificity selectors after higher-specificity ones; disabled here)
    'at-rule-no-deprecated': null, // (Normally disallows deprecated at-rules; disabled here)
    'at-rule-no-unknown': null, // (Normally disallows unknown at-rules; disabled here)
    'property-no-unknown': [
      true,
      {
        ignoreProperties: [
          // CSS Modules composition
          // https://github.com/css-modules/css-modules#composition
          'composes',
        ],
      },
    ],

    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: [
          // CSS Modules :global scope
          // https://github.com/css-modules/css-modules#exceptions
          'global',
          'local',
        ],
      },
    ],
    'rule-empty-line-before': [
      // Require or disallow an empty line before rules
      'always-multi-line',
      {
        except: ['first-nested'],
        ignore: ['after-comment'],
      },
    ],
    'at-rule-empty-line-before': [
      // Require or disallow an empty line before at-rules
      'always',
      {
        except: ['blockless-after-same-name-blockless', 'first-nested'],
        ignore: ['after-comment'],
      },
    ],
    'comment-empty-line-before': [
      // Require or disallow an empty line before comments
      'always',
      {
        except: ['first-nested'],
        ignore: ['stylelint-commands'],
      },
    ],
  },
  ignoreFiles: [
    'public',
    'node_modules',
    'build',
    '.history',
    '.next',
    '**/*.js',
    '**/*.jsx',
    '**/*.tsx',
    '**/*.ts',
    '**/*.json',
    '**/*.md',
  ],
};
