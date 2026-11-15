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
3. **Voice.** Give the explainer its voice, and let the voice set the timing:
   - **Read it myself:** a teleprompter shows each line; press Space as you start the next one. Your take is recorded and lined up line by line.
   - **Voice file:** load any voiceover (your recording, a WAV from Ether Reader in your voice, a Mac `say` file). Ether Explains finds the pauses and lines each sentence up with its words.
   - **Mac voice:** pick a system voice, time your lines with it, read along with the scene, or copy a Terminal command that saves it as a WAV.
   The waveform shows every cue; drag an edge to fine-tune, and nudge when the voice starts. The cues become the narration timing in the prompt.
4. **Prompt.** Copy the generated prompt into Claude. It asks for one self-contained three.js HTML file that follows the player rules below.
5. **Play.** Paste Claude's reply, or open a saved .html file. The voice plays locked to the scene's clock (play, pause, seek and restart all stay in sync).
6. **Revise.** Describe a change, and any player errors are added automatically. Tick *Retime to the latest voice cues* to have Claude move the beats onto a new take. Each version is kept.
7. **Record.** Press Record. The canvas and the voice are captured together; the voice is the master clock and the scene is kept on it. Downloads as MP4 (Safari, newer Chrome) or WebM.
8. **Edit in Ether's Cut.** Press ✂ Edit in Ether's Cut (or switch to the Ether's Cut view) and the recording opens in the editor with its voice: trim, add music, text, layers, effects and export.

There are no API keys or accounts. Projects and voices are saved in your browser on this Mac, and you can export or import projects as .json.

## Player rules (what the prompt asks Claude for)

- A single HTML file with three.js 0.170.0 loaded through an import map. No models, images or textures.
- All text is drawn inside the WebGL canvas, because only the canvas is recorded.
- Rendering is time-driven through `update(t)`, and the scene exposes:
  `window.ether = { duration, time, playing, play(), pause(), seek(t), restart(), setMuted(bool) }`
- The scene posts `ether-ready` and `ether-end` to the parent window.
- Optional Web Audio sound effects run through `ether.masterGain`, so they are recorded too.

`demo.html` ("Why the Moon has phases") is a complete example of these rules.

Style names and categories follow Futurepedia's free 3D Style Atlas. The style descriptions in this app are original.
