module.exports = function (api) {
  api.cache(true);
  return {
    // SDK 54 adds Worklets automatically; use the explicit alias below only once.
    presets: [[require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] }), { worklets: false }]],
    plugins: ['react-native-reanimated/plugin'],
  };
};
