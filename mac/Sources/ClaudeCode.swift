// Runs Claude Code (the `claude` command) on this Mac so Ether Explains can have Claude write scenes,
// signed in with your own Claude account. Also opens Terminal for signing in or installing Claude Code.
import Foundation
import AppKit

final class ClaudeCode {
    static let shared = ClaudeCode()
    private var process: Process?
    private var cachedPath: String?
    private var cachedEnvPath: String?

    private let supportDir: URL = {
        let u = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Ether Explains", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }()

    /// PATH as your Terminal sees it (apps opened from the Dock get a much shorter one).
    private func loginPath() -> String {
        if let p = cachedEnvPath { return p }
        let out = ClaudeCode.shell("/bin/zsh", ["-lc", "printf %s \"$PATH\""], timeout: 8).out
        let p = out.isEmpty ? "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" : out
        cachedEnvPath = p; return p
    }

    func findClaude() -> String? {
        if let p = cachedPath, FileManager.default.isExecutableFile(atPath: p) { return p }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = ["\(home)/.local/bin/claude", "\(home)/.claude/local/claude", "/opt/homebrew/bin/claude",
                          "/usr/local/bin/claude", "\(home)/.npm-global/bin/claude", "\(home)/.bun/bin/claude", "\(home)/.volta/bin/claude"]
        var found = candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
        if found == nil {
            let r = ClaudeCode.shell("/bin/zsh", ["-lc", "command -v claude"], timeout: 8).out.trimmingCharacters(in: .whitespacesAndNewlines)
            if r.hasPrefix("/"), FileManager.default.isExecutableFile(atPath: r) { found = r }
        }
        cachedPath = found
        return found
    }

    /// installed? version? signed in?
    func status(done: @escaping ([String: Any]) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            self.cachedPath = nil
            guard let claude = self.findClaude() else {
                return DispatchQueue.main.async { done(["installed": false]) }
            }
            var env = ProcessInfo.processInfo.environment; env["PATH"] = self.loginPath()
            let v = ClaudeCode.shell(claude, ["--version"], env: env, timeout: 20)
            let a = ClaudeCode.shell(claude, ["auth", "status"], env: env, timeout: 20)
            var info: [String: Any] = ["installed": true, "path": claude,
                                       "version": v.out.trimmingCharacters(in: .whitespacesAndNewlines),
                                       "signedIn": a.code == 0]
            if let d = a.out.data(using: .utf8), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                for k in ["email", "account", "subscriptionType", "authMethod", "loggedIn", "organization"] { if let v = j[k] { info[k] = v } }
                if let li = j["loggedIn"] as? Bool { info["signedIn"] = li }
            } else if !a.out.isEmpty || !a.err.isEmpty {
                info["authText"] = String((a.out + a.err).prefix(300))
            }
            DispatchQueue.main.async { done(info) }
        }
    }

    /// Opens Terminal to sign in (or install first, if Claude Code isn't on this Mac).
    func openTerminal(install: Bool) -> String? {
        let claude = findClaude()
        var script = "#!/bin/zsh -l\nclear\necho \"Ether Explains: connect Claude Code\"\necho\n"
        if install || claude == nil {
            script += "echo \"Installing Claude Code (Anthropic's official installer)…\"\ncurl -fsSL https://claude.ai/install.sh | bash || { echo; echo \"The install didn't finish. Check your internet connection and try again.\"; read -r; exit 1; }\nexport PATH=\"$HOME/.local/bin:$PATH\"\nCLAUDE=\"$(command -v claude)\"\n"
        } else {
            script += "CLAUDE='\(claude!)'\n"
        }
        script += """
        echo
        echo "Sign in with your Claude account in the browser window that opens."
        "$CLAUDE" auth login || "$CLAUDE"
        echo
        "$CLAUDE" auth status >/dev/null 2>&1 && echo "✓ Signed in. Go back to Ether Explains and press Check." || echo "Not signed in yet. Run this again from Ether Explains."
        echo "You can close this window."

        """
        let u = supportDir.appendingPathComponent("Connect Claude Code.command")
        do {
            try script.write(to: u, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: u.path)
        } catch { return "Couldn't prepare the sign-in window: \(error.localizedDescription)" }
        cachedPath = nil
        NSWorkspace.shared.open(u)
        return nil
    }

    func stop() { process?.terminate(); process = nil }

    /// Asks Claude Code for a reply and streams it. `progress` gets (characters so far, last bit of text).
    func run(prompt: String, system: String, model: String, partial: Bool = true,
             progress: @escaping (Int, String) -> Void, done: @escaping (String?, String?, [String: Any]) -> Void) {
        stop()
        guard let claude = findClaude() else { return done(nil, "Claude Code isn't installed on this Mac. Press Set up Claude Code.", [:]) }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: claude)
        var args = ["-p", "--output-format", "stream-json", "--verbose"]
        if partial { args.append("--include-partial-messages") }
        args += ["--append-system-prompt", system, "--max-turns", "3",
                 "--disallowedTools", "Bash,Edit,Write,MultiEdit,NotebookEdit,WebFetch,WebSearch,Task"]
        if !model.isEmpty { args += ["--model", model] }
        p.arguments = args
        var env = ProcessInfo.processInfo.environment; env["PATH"] = loginPath()
        p.environment = env
        let work = supportDir.appendingPathComponent("claude-work", isDirectory: true)
        try? FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
        p.currentDirectoryURL = work
        let inPipe = Pipe(), outPipe = Pipe(), errPipe = Pipe()
        p.standardInput = inPipe; p.standardOutput = outPipe; p.standardError = errPipe

        var buffer = Data(), text = "", fullText = "", resultText: String?, resultError: String?, meta: [String: Any] = [:]
        var errText = "", lastTick = Date.distantPast
        let lock = NSLock()
        func handle(line: String) {
            guard let d = line.data(using: .utf8), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return }
            switch j["type"] as? String {
            case "stream_event":
                if let ev = j["event"] as? [String: Any], let delta = ev["delta"] as? [String: Any],
                   delta["type"] as? String == "text_delta", let t = delta["text"] as? String { text += t }
            case "assistant":
                if let msg = j["message"] as? [String: Any], let content = msg["content"] as? [[String: Any]] {
                    for c in content where c["type"] as? String == "text" { fullText += (c["text"] as? String ?? "") }
                }
            case "result":
                resultText = j["result"] as? String
                if (j["is_error"] as? Bool) == true { resultError = (j["result"] as? String) ?? (j["subtype"] as? String) ?? "Claude Code reported an error." }
                for k in ["total_cost_usd", "duration_ms", "num_turns"] { if let v = j[k] { meta[k] = v } }
            default: break
            }
            let shown = text.isEmpty ? fullText : text
            if Date().timeIntervalSince(lastTick) > 0.4 {
                lastTick = Date()
                let n = shown.count, tail = String(shown.suffix(160))
                DispatchQueue.main.async { progress(n, tail) }
            }
        }
        outPipe.fileHandleForReading.readabilityHandler = { h in
            let chunk = h.availableData
            lock.lock(); defer { lock.unlock() }
            if chunk.isEmpty { return }
            buffer.append(chunk)
            while let nl = buffer.firstIndex(of: 0x0A) {
                let lineData = buffer.subdata(in: buffer.startIndex..<nl)
                buffer.removeSubrange(buffer.startIndex...nl)
                if let line = String(data: lineData, encoding: .utf8), !line.isEmpty { handle(line: line) }
            }
        }
        errPipe.fileHandleForReading.readabilityHandler = { h in
            let chunk = h.availableData
            if let s = String(data: chunk, encoding: .utf8) { lock.lock(); errText += s; if errText.count > 4000 { errText = String(errText.suffix(4000)) }; lock.unlock() }
        }
        p.terminationHandler = { [weak self] proc in
            outPipe.fileHandleForReading.readabilityHandler = nil
            errPipe.fileHandleForReading.readabilityHandler = nil
            lock.lock()
            let rest = outPipe.fileHandleForReading.readDataToEndOfFile()
            buffer.append(rest)
            if let s = String(data: buffer, encoding: .utf8) { s.split(separator: "\n").forEach { handle(line: String($0)) } }
            let answer = resultText ?? (fullText.isEmpty ? text : fullText)
            let err = errText, rErr = resultError
            lock.unlock()
            // older Claude Code without --include-partial-messages: run again without it
            if partial, proc.terminationStatus != 0, answer.isEmpty, err.contains("include-partial-messages") {
                DispatchQueue.main.async { self?.run(prompt: prompt, system: system, model: model, partial: false, progress: progress, done: done) }
                return
            }
            DispatchQueue.main.async {
                self?.process = nil
                if proc.terminationReason == .uncaughtSignal { return done(nil, "Stopped.", meta) }
                if let e = rErr { return done(nil, ClaudeCode.friendly(e), meta) }
                if answer.isEmpty {
                    let why = err.trimmingCharacters(in: .whitespacesAndNewlines)
                    return done(nil, why.isEmpty ? "Claude Code ended without an answer (exit \(proc.terminationStatus))." : ClaudeCode.friendly(String(why.suffix(400))), meta)
                }
                done(answer, nil, meta)
            }
        }
        do { try p.run() } catch { return done(nil, "Couldn't start Claude Code: \(error.localizedDescription)", [:]) }
        process = p
        if let d = prompt.data(using: .utf8) { inPipe.fileHandleForWriting.write(d) }
        try? inPipe.fileHandleForWriting.close()
    }

    static func friendly(_ e: String) -> String {
        let l = e.lowercased()
        if l.contains("login") || l.contains("api key") || l.contains("authenticat") || l.contains("401") {
            return "Claude Code isn't signed in. Press Sign in to Claude, then try again."
        }
        if l.contains("limit") && (l.contains("usage") || l.contains("rate") || l.contains("reached")) {
            return "Your Claude usage limit is reached for now. \(e.prefix(200))"
        }
        return e
    }

    /// Runs a command and waits (with a timeout).
    @discardableResult
    static func shell(_ path: String, _ args: [String], env: [String: String]? = nil, timeout: TimeInterval) -> (out: String, err: String, code: Int32) {
        let p = Process(); p.executableURL = URL(fileURLWithPath: path); p.arguments = args
        if let env = env { p.environment = env }
        let o = Pipe(), e = Pipe(); p.standardOutput = o; p.standardError = e; p.standardInput = FileHandle.nullDevice
        do { try p.run() } catch { return ("", error.localizedDescription, -1) }
        let deadline = Date().addingTimeInterval(timeout)
        while p.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
        if p.isRunning { p.terminate() }
        let out = String(data: o.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let err = String(data: e.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        return (out, err, p.isRunning ? -1 : p.terminationStatus)
    }
}
