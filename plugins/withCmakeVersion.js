/**
 * Expo config plugin: build ALL C++ code (the app's React Native codegen and every library module
 * with a native build, e.g. VisionCamera, worklets, Skia) with a newer CMake.
 *
 * Why: on Windows, the CMake 3.22.1 that the Android build installs by default ships ninja 1.10,
 * which can't handle paths over 260 characters. React Native codegen and Nitro-generated sources
 * produce object-file paths longer than that. CMake 4.x ships ninja ≥ 1.12, which handles long
 * paths when Windows long-path support is enabled (LongPathsEnabled = 1).
 *
 * CMake 4 also refuses projects that declare compatibility with CMake < 3.5; the standard
 * CMAKE_POLICY_VERSION_MINIMUM=3.5 argument keeps such libraries building.
 *
 * Usage in app.json: ["./plugins/withCmakeVersion.js", { "version": "4.1.2" }]
 * The version must be installed (Android Studio → SDK Manager → SDK Tools → CMake).
 */
const { withAppBuildGradle, withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// rifflect-cmake-version';

function addAppCmakeVersion(buildGradle, version) {
  if (buildGradle.includes(MARKER)) return buildGradle;
  const androidOpen = /android\s*\{/;
  if (!androidOpen.test(buildGradle)) {
    throw new Error('withCmakeVersion: could not find the android { } block in app/build.gradle');
  }
  const block = `
    ${MARKER}
    externalNativeBuild {
        cmake {
            version "${version}"
        }
    }
`;
  return buildGradle.replace(androidOpen, (m) => `${m}\n${block}`);
}

/** Root build.gradle: apply the same CMake version (and policy minimum) to every library module. */
function addLibrariesCmakeVersion(buildGradle, version) {
  if (buildGradle.includes(MARKER)) return buildGradle;
  return `${buildGradle.trimEnd()}

${MARKER}
subprojects { sub ->
    sub.plugins.withId("com.android.library") {
        sub.android.externalNativeBuild.cmake.version = "${version}"
        sub.android.defaultConfig.externalNativeBuild.cmake.arguments("-DCMAKE_POLICY_VERSION_MINIMUM=3.5")
    }
    sub.plugins.withId("com.android.application") {
        sub.android.defaultConfig.externalNativeBuild.cmake.arguments("-DCMAKE_POLICY_VERSION_MINIMUM=3.5")
    }
}
`;
}

module.exports = function withCmakeVersion(config, { version = '4.1.2' } = {}) {
  config = withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withCmakeVersion: only Groovy app/build.gradle is supported');
    }
    cfg.modResults.contents = addAppCmakeVersion(cfg.modResults.contents, version);
    return cfg;
  });
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withCmakeVersion: only Groovy build.gradle is supported');
    }
    cfg.modResults.contents = addLibrariesCmakeVersion(cfg.modResults.contents, version);
    return cfg;
  });
};

module.exports.addAppCmakeVersion = addAppCmakeVersion;
module.exports.addLibrariesCmakeVersion = addLibrariesCmakeVersion;
