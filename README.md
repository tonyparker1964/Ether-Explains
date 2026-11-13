<p align="center"><img src="icon.svg" width="96" alt="Ether Explains"></p>

<h1 align="center">Ether Explains</h1>

<p align="center">Build 3D animated explainers with Claude and three.js, then play and record them.<br>Part of the Ether family of apps.</p>

<p align="center">
  <a href="https://tonyparker1964.github.io/Ether-Explains/"><img src="https://img.shields.io/badge/%E2%96%B6%20Launch-Ether%20Explains-e8c37a?style=for-the-badge&labelColor=1d1838" alt="Launch Ether Explains"></a>
</p>

<p align="center"><b><a href="https://tonyparker1964.github.io/Ether-Explains/">tonyparker1964.github.io/Ether-Explains</a></b></p>

## How it works

1. **Style.** Pick one of 37 looks: Low-Poly, Paper Pop-Up, Glass and Light, Circuit City and more. You can also paste your own style prompt.
2. **Story.** Enter the topic, length, aspect ratio (16:9, 9:16 or 1:1), tone and palette. Paste your voiceover's SRT so each beat lands on its line, or write the script and let the app estimate the timing.
3. **Prompt.** Copy the generated prompt into Claude. It asks for one self-contained three.js HTML file that follows the player rules below.
4. **Play.** Paste Claude's reply, or open a saved .html file. It plays in the stage with play/pause, seek, restart, sound and fullscreen.
5. **Revise.** Describe a change, and any player errors are added automatically. Copy the change prompt back to Claude. Each version is kept.
6. **Record.** Add your voiceover file and press Record. The canvas and the audio are captured together and downloaded as MP4 (Safari, newer Chrome) or WebM.

There are no API keys or accounts. Projects are saved in your browser, and you can export or import them as .json.

## Player rules (what the prompt asks Claude for)

- A single HTML file with three.js 0.170.0 loaded through an import map. No models, images or textures.
- All text is drawn inside the WebGL canvas, because only the canvas is recorded.
- Rendering is time-driven through `update(t)`, and the scene exposes:
  `window.ether = { duration, time, playing, play(), pause(), seek(t), restart(), setMuted(bool) }`
- The scene posts `ether-ready` and `ether-end` to the parent window.
- Optional Web Audio sound effects run through `ether.masterGain`, so they are recorded too.

`demo.html` ("Why the Moon has phases") is a complete example of these rules.

Style names and categories follow Futurepedia's free 3D Style Atlas. The style descriptions in this app are original.
