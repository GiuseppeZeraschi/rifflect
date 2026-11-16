// Expo's default Metro config, plus: don't watch native build output.
//
// Why: an Android build writes hundreds of thousands of files into android/ and into each native
// library's android/build and android/.cxx folders (also under node_modules and modules/). Metro
// watched them all, and hung after every native build until restarted. None of them is JavaScript
// the app imports.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sep = '[\\\\/]';
const projectAndroid = new RegExp(
  `^${escape(path.join(__dirname, 'android')).split(escape(path.sep)).join(sep)}${sep}.*`,
);

const nativeBuildOutput = [
  // Any native library's build output (node_modules/*/android/build, modules/*/android/.cxx, …).
  new RegExp(`${sep}android${sep}(build|\\.cxx|\\.gradle|\\.kotlin)${sep}.*`),
  // The generated Android project (Continuous Native Generation): no JavaScript there.
  projectAndroid,
];
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...nativeBuildOutput,
];

module.exports = config;
