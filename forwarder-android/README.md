# SplitStream Forwarder (Android)

Relays bank SMS to the SplitStream `ingest-sms` Edge Function. One forwarder = one Device
(see `../CONTEXT.md`). No accounts, no store — direct APK install.

## Build

Requires JDK 17 and an Android SDK (set `ANDROID_HOME` or create `local.properties` with
`sdk.dir=/path/to/Android/sdk`).

```sh
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

## Install

```sh
adb install app/build/outputs/apk/debug/app-debug.apk
```

or copy the APK to the phone and open it (enable "install unknown apps" when prompted).

## Permissions

- **RECEIVE_SMS** — requested at first launch; without it nothing is forwarded.
- **INTERNET** — granted automatically.
- **Camera** — requested by the QR scanner only when you tap *Scan QR*.

Battery optimization can delay delivery in Doze; forwarding uses WorkManager
(network constraint + exponential backoff), so queued SMS are sent when the
device wakes or regains connectivity — nothing is lost, only delayed.

## Pairing

1. In the SplitStream web app, mint a device token (Settings → Devices) — it shows a QR.
2. Open the forwarder, tap **Scan QR** (or paste the raw token into the token field).
3. Leave the ingest URL as the default unless you run your own instance.
4. Tap **Save**.

## Sender whitelist

An SMS is forwarded when its sender contains any whitelist entry (case-insensitive).
Default: `HDFC, ICICI, SBI, AXIS, KOTAK, IDFC, PNB, BOB`. Edit the comma-separated
list on the main screen and Save.

## Delivery log

**Delivery log** shows the last 50 forward attempts (time, sender, status/HTTP code).
`rejected (401)` means the token is wrong or revoked — re-pair.
