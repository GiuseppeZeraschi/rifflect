# Rifflect

A guitar practice companion for Android. Record yourself playing with the phone's camera and
microphone, and get written feedback on your timing and technique, worked out entirely on the
phone. Takes and feedback are stored on the phone so you can track progress over time.

v1 is a personal app for one Android phone (Nothing Phone (4a)), installed directly and not
published. iOS is deferred. Design docs: [specs/001-guitar-practice-feedback/](specs/001-guitar-practice-feedback/).

## Prerequisites

- Node.js LTS and npm
- Android Studio (Android SDK, `adb`) and the JDK version required by the Expo SDK
- The phone, with Developer options and USB debugging enabled

## Development

```bash
npm install
npx expo prebuild --platform android   # generates android/ (never edit it by hand)
npx expo run:android --device          # debug build + Metro, for development only
```

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

## Release build and install (daily use)

Use release builds for real practice: they don't need the laptop, and analysis runs much faster.

### One-time: create the signing key

> **Keep the keystore file and its passwords safe and backed up** (e.g. a password manager plus a
> copy off this laptop). Android only installs an update if it's signed with the same key. If the key
> is lost, the next update needs an uninstall, and **uninstalling deletes every take**.

```bash
keytool -genkeypair -v -keystore %USERPROFILE%\keys\rifflect-release.jks -alias rifflect -keyalg RSA -keysize 2048 -validity 10000
```

Then add these lines to `%USERPROFILE%\.gradle\gradle.properties` (never commit them):

```properties
RIFFLECT_STORE_FILE=C:/Users/<you>/keys/rifflect-release.jks
RIFFLECT_KEY_ALIAS=rifflect
RIFFLECT_STORE_PASSWORD=...
RIFFLECT_KEY_PASSWORD=...
```

`plugins/withReleaseSigning.js` reads them on every build. If they're missing, the release build
stops with an error instead of quietly signing with the debug key.

### Every update

```bash
npm run build:apk     # expo prebuild + gradlew assembleRelease
npm run install:apk   # adb install -r: updates in place and keeps all takes
```

Don't install a debug build over the release build, or the other way round. The signatures differ,
so Android refuses the update or needs an uninstall.
