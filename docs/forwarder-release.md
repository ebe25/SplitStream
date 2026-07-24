# Releasing the forwarder APK

The PWA's "Get the forwarder" button points at
`https://github.com/ebe25/SplitStream/releases/latest/download/splitstream-forwarder.apk`,
so every release just needs an asset named exactly `splitstream-forwarder.apk`
on the latest release. Two ways to get one there:

## Signing (one-time setup)

CI builds a **release-signed** APK (Play Protect auto-blocks browser-sideloaded
SMS apps in India, and Obtainium/F-Droid/Play all need a stable signature).
The PKCS12 keystore lives in `secrets/` locally (gitignored — **back it up**;
losing it means a new signature and every user reinstalls) and in two repo
Actions secrets:

- `FORWARDER_KEYSTORE_B64` — contents of `secrets/forwarder-keystore.b64`
- `FORWARDER_KEYSTORE_PASSWORD` — contents of `secrets/forwarder-keystore-password.txt`

Set them at GitHub → repo Settings → Secrets and variables → Actions, or:

```sh
gh secret set FORWARDER_KEYSTORE_B64 < secrets/forwarder-keystore.b64
gh secret set FORWARDER_KEYSTORE_PASSWORD < secrets/forwarder-keystore-password.txt
```

Signature change vs old debug builds: existing installs must uninstall the old
forwarder first (device re-pairs via QR in seconds).

## Install path for users (why Obtainium)

Browser-downloaded APKs declaring `RECEIVE_SMS` are **auto-blocked by Play
Protect** in India (no user override; release signing doesn't help), and
intent-based sideloads trigger Android 13+ "restricted settings" for
notification access. Session-based installers are exempt from both — the PWA
Settings card therefore walks users through Obtainium
(`obtainium://add/https://github.com/ebe25/SplitStream`), keeping direct APK
as fallback. Longer-term: Play internal testing track (100 testers; SMS
allowed under the "SMS-based money management" policy exception) once a Play
Console account exists.

## CI path (recommended)

Commit the forwarder code, then:

```sh
git tag forwarder-v0.1.0
git push origin forwarder-v0.1.0
```

The `release-apk.yml` workflow builds a debug-signed APK and creates a GitHub
release with `splitstream-forwarder.apk` attached. As soon as it's the latest
release, the PWA download button serves it — nothing else to update.

No tag handy? Run the workflow manually: Actions → "Release forwarder APK" →
"Run workflow". That creates a release tagged `forwarder-manual-<run number>`.

## Local path

One-time setup (macOS):

```sh
brew install --cask temurin@17
brew install --cask android-commandlinetools
sdkmanager --licenses
sdkmanager "platforms;android-34" "build-tools;34.0.0"
```

Point Gradle at the SDK — create `forwarder-android/local.properties`:

```
sdk.dir=/opt/homebrew/share/android-commandlinetools
```

Build and release:

```sh
cd forwarder-android
./gradlew assembleDebug
cd app/build/outputs/apk/debug
# rename first — gh's `file#label` syntax sets the display label, not the
# download filename, and the PWA needs the filename to match exactly
cp app-debug.apk splitstream-forwarder.apk
gh release create forwarder-v0.1.0 splitstream-forwarder.apk
```

## Updates

Bump `versionCode` (and `versionName`) in `forwarder-android/app/build.gradle.kts`
before each release. Android upgrades in place only when `versionCode`
increases **and** the signing key matches.

Caveat: the debug keystore is per-machine. CI signs with its own consistent
key, your laptop with another. Mixing local and CI releases means phones must
uninstall/reinstall (losing app data) on the signature switch. Once anyone has
installed a CI build, stick to CI releases.
