// Talks to a model running on this Mac (Ollama, LM Studio, or any OpenAI-style server),
// so Ether Explains can write scenes itself. Requests go from the app, not the page, so no CORS setup is needed.
import Foundation

final class LocalAI {
    static let shared = LocalAI()
    private var task: Task<Void, Never>?

    /// Lists models. Tries Ollama's /api/tags first, then the OpenAI-style /v1/models.
    func models(base: String, done: @escaping ([String: Any]?, String?) -> Void) {
        Task {
            func get(_ path: String) async -> Any? {
                guard let u = URL(string: base + path) else { return nil }
                var r = URLRequest(url: u); r.timeoutInterval = 6
                guard let res = try? await URLSession.shared.data(for: r),
                      (res.1 as? HTTPURLResponse)?.statusCode == 200 else { return nil }
                return try? JSONSerialization.jsonObject(with: res.0)
            }
            if let j = await get("/api/tags") as? [String: Any], let ms = j["models"] as? [[String: Any]] {
                let names = ms.compactMap { $0["name"] as? String }
                let sizes = ms.reduce(into: [String: Double]()) { acc, m in if let n = m["name"] as? String, let s = m["size"] as? Double { acc[n] = s } }
                return DispatchQueue.main.async { done(["kind": "ollama", "models": names, "sizes": sizes], nil) }
            }
            if let j = await get("/v1/models") as? [String: Any], let ms = j["data"] as? [[String: Any]] {
                let names = ms.compactMap { $0["id"] as? String }
                return DispatchQueue.main.async { done(["kind": "openai", "models": names], nil) }
            }
            DispatchQueue.main.async { done(nil, "No local AI is answering at \(base). Open Ollama (or start LM Studio's server) and try again.") }
        }
    }

    func stop() { task?.cancel(); task = nil }

    /// Streams a reply. `progress` gets (characters so far, last bit of text) a few times a second.
    func run(base: String, kind: String, model: String, system: String, prompt: String,
             progress: @escaping (Int, String) -> Void, done: @escaping (String?, String?) -> Void) {
        stop()
        task = Task {
            var out = ""
            var lastTick = Date.distantPast
            func tick(_ force: Bool = false) {
                if force || Date().timeIntervalSince(lastTick) > 0.4 {
                    lastTick = Date()
                    let n = out.count, tail = String(out.suffix(160))
                    DispatchQueue.main.async { progress(n, tail) }
                }
            }
            do {
                let ollama = kind == "ollama"
                guard let url = URL(string: base + (ollama ? "/api/chat" : "/v1/chat/completions")) else { throw err("The local AI address isn't valid.") }
                var req = URLRequest(url: url)
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.timeoutInterval = 900 // a big model can take minutes to load off an external drive
                let messages: [[String: String]] = [["role": "system", "content": system], ["role": "user", "content": prompt]]
                let body: [String: Any] = ollama
                    ? ["model": model, "messages": messages, "stream": true, "keep_alive": "15m",
                       "options": ["num_ctx": 32768, "num_predict": 30000, "temperature": 0.35]]
                    : ["model": model, "messages": messages, "stream": true, "temperature": 0.35, "max_tokens": 30000]
                req.httpBody = try JSONSerialization.data(withJSONObject: body)
                let (bytes, resp) = try await URLSession.shared.bytes(for: req)
                if let h = resp as? HTTPURLResponse, h.statusCode != 200 {
                    var text = ""; for try await line in bytes.lines { text += line; if text.count > 400 { break } }
                    throw err("The local AI answered with an error (\(h.statusCode)). \(text.prefix(300))")
                }
                for try await line in bytes.lines {
                    if Task.isCancelled { throw err("Stopped.") }
                    var payload = line.trimmingCharacters(in: .whitespaces)
                    if payload.isEmpty { continue }
                    if !ollama {
                        guard payload.hasPrefix("data:") else { continue }
                        payload = String(payload.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                        if payload == "[DONE]" { break }
                    }
                    guard let d = payload.data(using: .utf8), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { continue }
                    if let e = j["error"] { throw err("The local AI reported: \(e)") }
                    if ollama {
                        if let m = j["message"] as? [String: Any], let c = m["content"] as? String { out += c }
                        if j["done"] as? Bool == true { break }
                    } else if let ch = (j["choices"] as? [[String: Any]])?.first, let delta = ch["delta"] as? [String: Any], let c = delta["content"] as? String {
                        out += c
                    }
                    tick()
                }
                tick(true)
                let result = out
                DispatchQueue.main.async { done(result, nil) }
            } catch {
                let msg = (error as NSError).domain == "Ether" ? error.localizedDescription
                    : (Task.isCancelled ? "Stopped." : "Couldn't reach the local AI: \(error.localizedDescription)")
                DispatchQueue.main.async { done(nil, msg) }
            }
        }
    }

    private func err(_ m: String) -> NSError { NSError(domain: "Ether", code: 1, userInfo: [NSLocalizedDescriptionKey: m]) }
}
