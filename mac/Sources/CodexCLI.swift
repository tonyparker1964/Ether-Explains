// Runs OpenAI's Codex CLI (`codex`) on this Mac so Ether Explains can have ChatGPT write scenes,
// signed in with your own ChatGPT account. Also opens Terminal for signing in or installing Codex.
import Foundation
import AppKit

final class CodexCLI {
    static let shared = CodexCLI()
    static let runMarker = "ether-explains-scene" // in the output file name, so leftover runs can be found
    private var process: Process?
    private var cachedPath: String?

    private let supportDir: URL = {
        let u = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Ether Explains", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }()

    func find() -> String? {
        if let p = cachedPath, FileManager.default.isExecutableFile(atPath: p) { return p }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = ["\(home)/.local/bin/codex", "/opt/homebrew/bin/codex", "/usr/local/bin/codex",
                          "\(home)/.npm-global/bin/codex", "\(home)/.codex/bin/codex", "\(home)/.bun/bin/codex", "\(home)/.volta/bin/codex"]
        var found = candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
        if found == nil {
            let r = ClaudeCode.shell("/bin/zsh", ["-lc", "command -v codex"], timeout: 8).out.trimmingCharacters(in: .whitespacesAndNewlines)
            if r.hasPrefix("/"), FileManager.default.isExecutableFile(atPath: r) { found = r }
        }
        cachedPath = found
        return found
    }

    private func loginShell(_ cmd: String, timeout: TimeInterval) -> (out: String, err: String, code: Int32) {
        ClaudeCode.shell("/bin/zsh", ["-lc", cmd], timeout: timeout)
    }

    func status(done: @escaping ([String: Any]) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            self.cachedPath = nil
            guard let codex = self.find() else { return DispatchQueue.main.async { done(["installed": false]) } }
            let q = "'" + codex.replacingOccurrences(of: "'", with: "'\\''") + "'"
            let v = self.loginShell("\(q) --version", timeout: 20)
            let s = self.loginShell("\(q) login status", timeout: 20)
            let text = (s.out + "\n" + s.err).trimmingCharacters(in: .whitespacesAndNewlines)
            let low = text.lowercased()
            let signedIn = s.code == 0 && !low.contains("not logged in") && !low.contains("not signed in")
            var info: [String: Any] = ["installed": true, "path": codex, "signedIn": signedIn,
                                       "version": v.out.trimmingCharacters(in: .whitespacesAndNewlines), "statusText": String(text.prefix(200))]
            if low.contains("chatgpt") { info["method"] = "ChatGPT" } else if low.contains("api key") { info["method"] = "API key" }
            DispatchQueue.main.async { done(info) }
        }
    }

    func openTerminal(install: Bool) -> String? {
        let codex = find()
        var script = "#!/bin/zsh -l\nclear\necho \"Ether Explains: connect your ChatGPT account (Codex)\"\necho\n"
        if install || codex == nil {
            script += """
            echo "Installing OpenAI's Codex…"
            if command -v npm >/dev/null 2>&1; then npm install -g @openai/codex --prefix "$HOME/.local"; else curl -fsSL https://chatgpt.com/codex/install.sh | sh; fi
            export PATH="$HOME/.local/bin:$HOME/.codex/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
            CODEX="$(command -v codex)"
            [ -z "$CODEX" ] && { echo; echo "The install didn't finish. Check your internet connection and try again."; read -r; exit 1; }

            """
        } else {
            script += "CODEX='\(codex!)'\n"
        }
        script += """
        echo
        echo "Sign in with your ChatGPT account in the browser window that opens."
        "$CODEX" login
        echo
        "$CODEX" login status && echo "✓ Go back to Ether Explains and press ↻." || echo "Not signed in yet. Run this again from Ether Explains."
        echo "You can close this window."

        """
        let u = supportDir.appendingPathComponent("Connect ChatGPT.command")
        do {
            try script.write(to: u, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: u.path)
        } catch { return "Couldn't prepare the sign-in window: \(error.localizedDescription)" }
        cachedPath = nil
        NSWorkspace.shared.open(u)
        return nil
    }

    func stop() { process?.terminate(); process = nil }

    static func stopLeftovers() {
        DispatchQueue.global(qos: .utility).async { ClaudeCode.shell("/usr/bin/pkill", ["-f", runMarker], timeout: 5) }
    }

    /// Asks Codex (signed in with ChatGPT) for a reply. Codex doesn't stream the answer's words, so progress
    /// reports the stage (thinking / writing) instead.
    func run(prompt: String, system: String, model: String,
             progress: @escaping (Int, String) -> Void, done: @escaping (String?, String?, [String: Any]) -> Void) {
        stop()
        guard let codex = find() else { return done(nil, "Codex isn't installed on this Mac. Press Set up ChatGPT.", [:]) }
        let work = supportDir.appendingPathComponent("codex-work", isDirectory: true)
        try? FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
        let outFile = work.appendingPathComponent("\(CodexCLI.runMarker)-\(UUID().uuidString.prefix(6)).txt")
        try? FileManager.default.removeItem(at: outFile)

        var args = ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--json",
                    "--output-last-message", outFile.path]
        if !model.isEmpty { args += ["--model", model] }
        args.append("-") // prompt comes from stdin
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/zsh") // your login shell, exactly like Terminal
        p.arguments = ["-lc", "exec \"$0\" \"$@\"", codex] + args
        p.currentDirectoryURL = work
        let inPipe = Pipe(), outPipe = Pipe(), errPipe = Pipe()
        p.standardInput = inPipe; p.standardOutput = outPipe; p.standardError = errPipe

        let lock = NSLock()
        var buffer = Data(), errText = "", lastMessage = "", errorMsg: String?, stage = "ChatGPT is planning the scene…"
        var lastTick = Date.distantPast
        func handle(_ line: String) {
            guard let d = line.data(using: .utf8), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return }
            let type = j["type"] as? String ?? ""
            let item = (j["item"] as? [String: Any]) ?? ((j["msg"] as? [String: Any]) ?? [:])
            let itype = (item["type"] as? String ?? item["item_type"] as? String ?? "").lowercased()
            if itype.contains("reasoning") { stage = "ChatGPT is planning the scene…" }
            if itype.contains("agent_message") || itype.contains("assistant") {
                stage = "ChatGPT is writing the scene…"
                if let t = item["text"] as? String, !t.isEmpty { lastMessage = t }
            }
            if type.contains("error") || type == "turn.failed" {
                let m = (j["message"] as? String) ?? ((j["error"] as? [String: Any])?["message"] as? String) ?? (item["message"] as? String)
                if let m = m, !m.isEmpty { errorMsg = m }
            }
            if Date().timeIntervalSince(lastTick) > 0.5 {
                lastTick = Date()
                let s = stage, n = lastMessage.count
                DispatchQueue.main.async { progress(n, n > 0 ? String(lastMessage.suffix(160)) : s) }
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
                if let line = String(data: lineData, encoding: .utf8), !line.isEmpty { handle(line) }
            }
        }
        errPipe.fileHandleForReading.readabilityHandler = { h in
            if let s = String(data: h.availableData, encoding: .utf8), !s.isEmpty {
                lock.lock(); errText += s; if errText.count > 4000 { errText = String(errText.suffix(4000)) }; lock.unlock()
            }
        }
        p.terminationHandler = { [weak self] proc in
            outPipe.fileHandleForReading.readabilityHandler = nil
            errPipe.fileHandleForReading.readabilityHandler = nil
            lock.lock()
            buffer.append(outPipe.fileHandleForReading.readDataToEndOfFile())
            if let s = String(data: buffer, encoding: .utf8) { s.split(separator: "\n").forEach { handle(String($0)) } }
            let fileAnswer = (try? String(contentsOf: outFile, encoding: .utf8)) ?? ""
            let answer = fileAnswer.isEmpty ? lastMessage : fileAnswer
            let err = errText, eMsg = errorMsg
            lock.unlock()
            try? FileManager.default.removeItem(at: outFile)
            DispatchQueue.main.async {
                self?.process = nil
                if proc.terminationReason == .uncaughtSignal { return done(nil, "Stopped.", [:]) }
                if answer.isEmpty {
                    let why = eMsg ?? err.trimmingCharacters(in: .whitespacesAndNewlines)
                    return done(nil, CodexCLI.friendly(why.isEmpty ? "Codex ended without an answer (exit \(proc.terminationStatus))." : String(why.suffix(400))), [:])
                }
                done(answer, nil, [:])
            }
        }
        do { try p.run() } catch { return done(nil, "Couldn't start Codex: \(error.localizedDescription)", [:]) }
        process = p
        let full = system + "\n\nDo not create, edit or run any files. Answer only with the HTML in your reply.\n\n" + prompt
        if let d = full.data(using: .utf8) { inPipe.fileHandleForWriting.write(d) }
        try? inPipe.fileHandleForWriting.close()
        DispatchQueue.main.async { progress(0, "ChatGPT is planning the scene…") }
    }

    static func friendly(_ e: String) -> String {
        let l = e.lowercased()
        if l.contains("login") || l.contains("not signed") || l.contains("401") || l.contains("unauthorized") {
            return "Codex isn't signed in to ChatGPT. Press Sign in to ChatGPT, then try again."
        }
        if l.contains("usage limit") || l.contains("rate limit") || l.contains("429") { return "Your ChatGPT usage limit is reached for now. \(e.prefix(200))" }
        return e
    }
}
