// CommonJS, per the .cjs extension. This shipped as `export default`, which
// node cannot parse in a .cjs module, so every `npm run lint` has died with
// `SyntaxError: Unexpected token 'export'` before linting a single line — and
// because eslintrc precedence puts this file ahead of .eslintrc.json, the
// package has had no lint coverage at all rather than falling back to it.
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    '@electron-toolkit/eslint-config-ts/recommended',
    '@electron-toolkit/eslint-config-prettier'
  ]
}
