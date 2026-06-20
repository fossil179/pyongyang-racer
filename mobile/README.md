# Pyongyang Racer — iOS & Android app

Native app shells for **Pyongyang Racer** built with [Capacitor](https://capacitorjs.com/). The game runs inside a full-screen WebView with **on-screen driving controls** (steer, gas, brake, honk).

## What you get

| Feature | v1 (now) | v2 (CheerpX license) |
|---------|----------|----------------------|
| iOS app | Yes | Yes |
| Android app | Yes | Yes |
| Offline play | Yes | Yes |
| Touch controls | Yes | Yes |
| Sound | Yes (Ruffle) | Yes |
| 3D graphics | Ruffle (some textures wrong) | **Correct** (real Flash) |

**v1 uses Ruffle** so you can build and ship immediately. When you have **CheerpX**, change one line in `www/js/config.js` for production-quality graphics.

A **full native remake** (Unity/Godot) is a separate, larger project — this app wraps the original SWF.

---

## Requirements

- **Node.js 18+**
- **iOS:** Mac with **Xcode**, Apple Developer account ($99/year)
- **Android:** **Android Studio**, Google Play account ($25 one-time)

---

## Setup (once)

```bash
cd mobile
chmod +x setup.sh sync-assets.sh
./setup.sh
```

This installs dependencies, copies game + Ruffle into `www/`, and creates `ios/` and `android/` projects.

---

## Build iOS

```bash
cd mobile
npm run cap:sync
npm run cap:open:ios
```

In Xcode:

1. Select your **Team** (Signing & Capabilities)
2. Set **Bundle ID** if needed (`com.koryotours.pyongyangracer`)
3. Under **General → Deployment Info**, prefer **Landscape** only
4. **Product → Run** on simulator or device

---

## Build Android

```bash
cd mobile
npm run cap:sync
npm run cap:open:android
```

In Android Studio:

1. Wait for Gradle sync
2. **Run** on emulator or device
3. For release: **Build → Generate Signed Bundle/APK**

To lock landscape, add `android:screenOrientation="sensorLandscape"` on the main activity in `AndroidManifest.xml`.

---

## After changing game files

From repo root, after updating SWF or assets:

```bash
cd mobile
npm run cap:sync
```

Then rebuild in Xcode / Android Studio.

---

## Upgrade to CheerpX (correct graphics)

1. Obtain CheerpX for Flash license (with owner authorization)
2. Host CheerpX assets on your server
3. Edit `www/js/config.js`:

```javascript
window.PYONGYANG_RACER = {
  engine: "cheerpx",
  swfPath: "PY Racer_0509/PYracer.swf",
  cheerpxScriptUrl: "https://yourdomain.com/cheerpx/integration.js"
};
```

4. `npm run cap:sync` and resubmit to App Store / Play Store

---

## App Store notes (with owner authorization)

- Credit **Koryo Tours / Nosotek (2012)** in app description
- Category: Games → Racing (or Entertainment)
- Mention educational / cultural tourism context if applicable
- Privacy policy URL may be required (game has no analytics in this build)

---

## Troubleshooting

**Black screen:** Run `npm run sync` — game files missing from `www/`.

**No sound on iOS:** Tap the game once (browser autoplay policy); Ruffle should unmute after interaction.

**Controls not working:** Use landscape; touch the on-screen buttons (they send arrow keys + space to the game).
