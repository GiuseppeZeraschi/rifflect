// The `@/*` alias (→ src/*) is resolved by Metro from tsconfig.json `paths`, and by Jest via moduleNameMapper.
// `inline-import` lets Drizzle's generated `.sql` migrations be bundled into the app.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
