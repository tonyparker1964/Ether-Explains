# Ether Explains for Mac

A native Mac app for Ether Explains: Studio, Voice and Ether's Cut in one window, plus what a browser can't do:

- **Mac voices go into the video.** In Voice › 🗣 Mac voice, pick any voice and press **Make the voice track**. Every line is rendered with that voice and lined up exactly, ready to play with the scene and record.
- **Saves straight to Movies › Ether Explains.** Recordings, Ether's Cut exports, voice WAVs and HTML files all land there (File › Open Saved Videos Folder, ⇧⌘O).
- **Works offline.** three.js is bundled, so scenes play without the internet.
- **Your microphone** for reading lines yourself (macOS asks the first time).

## Build and install

Double-click **Build.command**. It compiles the app with Swift (Xcode or the Command Line Tools), installs it to `~/Applications/Ether Explains.app` and opens it. Run it again after any update.

## How it's made

`Sources/` is a SwiftUI app that hosts the studio in a WKWebView, served from inside the app on 127.0.0.1 so projects and voices are kept on this Mac. `SpeechEngine.swift` renders Mac voices with AVSpeechSynthesizer into one WAV with per-line timing.
