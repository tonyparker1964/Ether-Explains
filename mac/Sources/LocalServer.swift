// A tiny static file server bound to 127.0.0.1 only.
// Serving the studio from http://127.0.0.1 (a secure context) lets WebKit use the microphone,
// keeps saved projects in one stable place (fixed port), and lets scenes load three.js offline.
import Foundation
import Network

final class LocalServer {
    static let shared = LocalServer()
    private let queue = DispatchQueue(label: "ether.server")
    private var listener: NWListener?
    private(set) var port: UInt16 = 0

    var baseURL: String { "http://127.0.0.1:\(port)" }

    @discardableResult
    func start() -> UInt16 {
        if port != 0 { return port }
        for p in UInt16(47811)...UInt16(47830) {
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: p)!)
            guard let l = try? NWListener(using: params) else { continue }
            let sem = DispatchSemaphore(value: 0)
            var ok = false
            l.stateUpdateHandler = { state in
                switch state {
                case .ready: ok = true; sem.signal()
                case .failed, .cancelled: sem.signal()
                default: break
                }
            }
            l.newConnectionHandler = { [weak self] c in self?.handle(c) }
            l.start(queue: queue)
            _ = sem.wait(timeout: .now() + 2)
            if ok { listener = l; port = p; return p }
            l.cancel()
        }
        return 0
    }

    private func handle(_ c: NWConnection) {
        c.start(queue: queue)
        var buf = Data()
        func read() {
            c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, done, err in
                if let d = data { buf.append(d) }
                if let r = buf.range(of: Data("\r\n\r\n".utf8)) {
                    self?.respond(c, head: String(decoding: buf[..<r.lowerBound], as: UTF8.self))
                } else if done || err != nil || buf.count > 1 << 20 {
                    c.cancel()
                } else { read() }
            }
        }
        read()
    }

    private func respond(_ c: NWConnection, head: String) {
        let first = head.components(separatedBy: "\r\n").first ?? ""
        let parts = first.split(separator: " ")
        guard parts.count >= 2 else { return send(c, status: "400 Bad Request", type: "text/plain", body: Data("bad request".utf8)) }
        let isHead = parts[0] == "HEAD"
        var path = String(parts[1])
        if let q = path.firstIndex(where: { $0 == "?" || $0 == "#" }) { path = String(path[..<q]) }
        path = path.removingPercentEncoding ?? path
        if path == "/" || path.isEmpty { path = "/index.html" }

        let base: URL
        let rel: String
        if path.hasPrefix("/native-tmp/") { base = Paths.tmpDir; rel = String(path.dropFirst("/native-tmp/".count)) }
        else { base = Paths.webRoot; rel = String(path.dropFirst()) }
        let root = base.standardizedFileURL.path
        let file = base.appendingPathComponent(rel).standardizedFileURL
        var isDir: ObjCBool = false
        guard file.path.hasPrefix(root + "/"),
              FileManager.default.fileExists(atPath: file.path, isDirectory: &isDir), !isDir.boolValue,
              let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            return send(c, status: "404 Not Found", type: "text/plain", body: Data("not found".utf8))
        }
        send(c, status: "200 OK", type: LocalServer.mime(file.pathExtension), body: isHead ? Data() : data, length: data.count)
    }

    private func send(_ c: NWConnection, status: String, type: String, body: Data, length: Int? = nil) {
        var h = "HTTP/1.1 \(status)\r\n"
        h += "Content-Type: \(type)\r\n"
        h += "Content-Length: \(length ?? body.count)\r\n"
        h += "Cache-Control: no-cache\r\n"
        h += "Access-Control-Allow-Origin: *\r\n"
        h += "Connection: close\r\n\r\n"
        var out = Data(h.utf8); out.append(body)
        c.send(content: out, completion: .contentProcessed { _ in c.cancel() })
    }

    static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "wav": return "audio/wav"
        case "wasm": return "application/wasm"
        default: return "application/octet-stream"
        }
    }
}
