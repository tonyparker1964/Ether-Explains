// Mac voices → a real voice track. Each line is rendered with AVSpeechSynthesizer.write, so the app knows
// exactly where every line starts and ends; the result is one WAV plus timed cues.
import Foundation
import AVFoundation

final class SpeechEngine: NSObject {
    private let previewSynth = AVSpeechSynthesizer()
    private var renderSynth: AVSpeechSynthesizer?

    struct Rendered { let file: String; let cues: [[String: Any]]; let duration: Double }

    func voices() -> [[String: Any]] {
        AVSpeechSynthesisVoice.speechVoices().map { v in
            let q: String
            switch v.quality {
            case .premium: q = "Premium"
            case .enhanced: q = "Enhanced"
            default: q = ""
            }
            return ["id": v.identifier, "name": v.name, "lang": v.language, "quality": q]
        }
    }

    private func utterance(_ text: String, voiceId: String?, rate: Double) -> AVSpeechUtterance {
        let u = AVSpeechUtterance(string: text)
        if let id = voiceId, let v = AVSpeechSynthesisVoice(identifier: id) { u.voice = v }
        let r = AVSpeechUtteranceDefaultSpeechRate * Float(rate)
        u.rate = max(AVSpeechUtteranceMinimumSpeechRate, min(AVSpeechUtteranceMaximumSpeechRate, r))
        return u
    }

    func preview(_ text: String, voiceId: String?, rate: Double) {
        previewSynth.stopSpeaking(at: .immediate)
        previewSynth.speak(utterance(text, voiceId: voiceId, rate: rate))
    }
    func stop() { previewSynth.stopSpeaking(at: .immediate) }

    /// Render every line, leave `gap` seconds between lines, return one WAV and the cue times.
    func render(lines: [String], voiceId: String?, rate: Double, gap: Double, done: @escaping (Result<Rendered, Error>) -> Void) {
        var segments: [[Float]] = []
        var sampleRate: Double = 0
        var index = 0

        func next() {
            if index >= lines.count { return finish() }
            let text = lines[index]
            renderLine(text, voiceId: voiceId, rate: rate) { samples, sr in
                if sampleRate == 0 { sampleRate = sr }
                segments.append(sr == sampleRate || sr == 0 ? samples : SpeechEngine.resample(samples, from: sr, to: sampleRate))
                index += 1
                next()
            }
        }

        func finish() {
            guard sampleRate > 0 else {
                return done(.failure(NSError(domain: "Ether", code: 1, userInfo: [NSLocalizedDescriptionKey: "That voice produced no audio. Try another voice, or download it in System Settings › Accessibility › Spoken Content."])))
            }
            let lead = Int(0.4 * sampleRate), gapN = Int(gap * sampleRate), tail = Int(0.5 * sampleRate)
            var out = [Float](repeating: 0, count: lead)
            var cues: [[String: Any]] = []
            for (i, seg) in segments.enumerated() {
                let startIdx = out.count
                // the voice's own silence at the edges of each line doesn't count as the line
                let thr: Float = 0.006
                let first = seg.firstIndex(where: { abs($0) > thr }) ?? 0
                let last = seg.lastIndex(where: { abs($0) > thr }) ?? max(0, seg.count - 1)
                out.append(contentsOf: seg)
                cues.append(["start": Double(startIdx + first) / sampleRate,
                             "end": Double(startIdx + last + 1) / sampleRate,
                             "text": lines[i]])
                out.append(contentsOf: [Float](repeating: 0, count: i == segments.count - 1 ? tail : gapN))
            }
            let name = "voice-\(UUID().uuidString.prefix(8)).wav"
            let url = Paths.tmpDir.appendingPathComponent(name)
            do {
                try SpeechEngine.writeWav(out, sampleRate: Int(sampleRate), to: url)
                done(.success(Rendered(file: name, cues: cues, duration: Double(out.count) / sampleRate)))
            } catch { done(.failure(error)) }
        }
        next()
    }

    private func renderLine(_ text: String, voiceId: String?, rate: Double, done: @escaping ([Float], Double) -> Void) {
        let synth = AVSpeechSynthesizer()
        renderSynth = synth
        var samples: [Float] = []
        var sr: Double = 0
        var finished = false
        var lastBuffer = Date()
        let finishOnce = {
            if finished { return }
            finished = true
            DispatchQueue.main.async { done(samples, sr) }
        }
        synth.write(utterance(text, voiceId: voiceId, rate: rate)) { buffer in
            guard let pcm = buffer as? AVAudioPCMBuffer else { return }
            if pcm.frameLength == 0 { finishOnce(); return }
            lastBuffer = Date()
            sr = pcm.format.sampleRate
            let n = Int(pcm.frameLength)
            if let f = pcm.floatChannelData {
                samples.append(contentsOf: UnsafeBufferPointer(start: f[0], count: n))
            } else if let i16 = pcm.int16ChannelData {
                let p = UnsafeBufferPointer(start: i16[0], count: n)
                samples.append(contentsOf: p.map { Float($0) / 32768 })
            } else if let i32 = pcm.int32ChannelData {
                let p = UnsafeBufferPointer(start: i32[0], count: n)
                samples.append(contentsOf: p.map { Float($0) / 2147483648 })
            }
        }
        // safety net: some voices never send the empty "done" buffer
        func watchdog() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                if finished { return }
                let idle = Date().timeIntervalSince(lastBuffer)
                if (!samples.isEmpty && idle > 1.5) || idle > 20 { finishOnce() } else { watchdog() }
            }
        }
        watchdog()
    }

    static func resample(_ x: [Float], from: Double, to: Double) -> [Float] {
        guard from > 0, to > 0, !x.isEmpty else { return x }
        let n = Int(Double(x.count) * to / from)
        return (0..<n).map { i in
            let p = Double(i) * from / to, k = Int(p), f = Float(p - Double(k))
            let a = x[min(k, x.count - 1)], b = x[min(k + 1, x.count - 1)]
            return a + (b - a) * f
        }
    }

    static func writeWav(_ s: [Float], sampleRate: Int, to url: URL) throws {
        var d = Data()
        func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
        func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
        let bytes = UInt32(s.count * 2)
        d.append(Data("RIFF".utf8)); u32(36 + bytes); d.append(Data("WAVEfmt ".utf8))
        u32(16); u16(1); u16(1); u32(UInt32(sampleRate)); u32(UInt32(sampleRate * 2)); u16(2); u16(16)
        d.append(Data("data".utf8)); u32(bytes)
        var pcm = [Int16](repeating: 0, count: s.count)
        for i in 0..<s.count { pcm[i] = Int16(max(-1, min(1, s[i])) * 32767) }
        pcm.withUnsafeBufferPointer { d.append(Data(buffer: $0)) }
        try d.write(to: url)
    }
}
