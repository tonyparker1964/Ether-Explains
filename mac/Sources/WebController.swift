// Hosts the studio in a WKWebView and answers it from the Mac side.
import AppKit
import WebKit

final class WebController: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandlerWithReply {
    static weak var shared: WebController?
    let web: WKWebView
    private let speech = SpeechEngine()
    private var downloads: [ObjectIdentifier: URL] = [:]
    private var selfTestRan = false

    override init() {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.preferences.isElementFullscreenEnabled = true
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = false
        // keep scenes, voice and recording running when the window is behind other windows
        // (WebKit otherwise freezes timers and animation in pages it thinks you can't see)
        WebController.turnOff(cfg.preferences, "_setHiddenPageDOMTimerThrottlingEnabled:")
        WebController.turnOff(cfg.preferences, "_setPageVisibilityBasedProcessSuspensionEnabled:")
        let ucc = WKUserContentController()
        cfg.userContentController = ucc
        web = WKWebView(frame: .zero, configuration: cfg)
        super.init()
        WebController.shared = self

        let port = LocalServer.shared.start()
        let base = "http://127.0.0.1:\(port)"
        let hasThree = FileManager.default.fileExists(atPath: Paths.webRoot.appendingPathComponent("vendor/three/build/three.module.js").path)
        let info = """
        window.EtherNative = { app: 'Ether Explains for Mac', version: '\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")',
          threeBase: \(hasThree ? "'\(base)/vendor/three/'" : "null"), saveFolder: 'Movies › Ether Explains',
          call: (action, data) => window.webkit.messageHandlers.ether.postMessage(Object.assign({ action }, data || {})) };
        """
        ucc.addUserScript(WKUserScript(source: info, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        ucc.addScriptMessageHandler(self, contentWorld: .page, name: "ether")

        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        WebController.turnOff(web, "_setWindowOcclusionDetectionEnabled:")
        web.setValue(false, forKey: "drawsBackground")
        if #available(macOS 13.3, *) { web.isInspectable = true }
        if port == 0 {
            web.loadHTMLString("<body style='background:#07060f;color:#eee;font:16px system-ui;padding:40px'>Ether Explains couldn't start its local studio (ports 47811–47830 are busy). Quit other copies and try again.</body>", baseURL: nil)
        } else {
            web.load(URLRequest(url: URL(string: "\(base)/index.html")!))
        }
    }

    func reload() { web.reload() }

    /// Calls a WebKit setter with NO, only if this macOS version has it.
    static func turnOff(_ obj: NSObject, _ selector: String) {
        let sel = NSSelectorFromString(selector)
        if obj.responds(to: sel) { _ = obj.perform(sel, with: nil) }
    }

    // MARK: messages from the page
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return replyHandler(nil, "Bad message") }
        switch action {
        case "voices":
            replyHandler(speech.voices(), nil)
        case "speak":
            speech.preview(body["text"] as? String ?? "", voiceId: body["voiceId"] as? String, rate: body["rate"] as? Double ?? 1)
            replyHandler(true, nil)
        case "stopSpeaking":
            speech.stop(); replyHandler(true, nil)
        case "synth":
            let lines = (body["lines"] as? [String] ?? []).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            guard !lines.isEmpty else { return replyHandler(nil, "No lines to read.") }
            speech.render(lines: lines, voiceId: body["voiceId"] as? String, rate: body["rate"] as? Double ?? 1,
                          gap: body["gap"] as? Double ?? 0.45) { result in
                switch result {
                case .success(let r): replyHandler(["url": "/native-tmp/\(r.file)", "cues": r.cues, "duration": r.duration], nil)
                case .failure(let e): replyHandler(nil, e.localizedDescription)
                }
            }
        case "copy":
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(body["text"] as? String ?? "", forType: .string)
            replyHandler(true, nil)
        case "openSaveFolder":
            NSWorkspace.shared.open(Paths.saveDir); replyHandler(true, nil)
        case "reveal":
            let u = Paths.saveDir.appendingPathComponent(body["name"] as? String ?? "")
            if FileManager.default.fileExists(atPath: u.path) { NSWorkspace.shared.activateFileViewerSelecting([u]) } else { NSWorkspace.shared.open(Paths.saveDir) }
            replyHandler(true, nil)
        case "log":
            let line = (body["text"] as? String ?? "") + "\n"
            let u = Paths.saveDir.appendingPathComponent(".selftest.log")
            if let h = try? FileHandle(forWritingTo: u) { h.seekToEndOfFile(); h.write(Data(line.utf8)); try? h.close() }
            else { try? line.write(to: u, atomically: true, encoding: .utf8) }
            replyHandler(true, nil)
        default:
            replyHandler(nil, "Unknown action \(action)")
        }
    }

    // MARK: navigation
    func webView(_ webView: WKWebView, decidePolicyFor a: WKNavigationAction, preferences: WKWebpagePreferences,
                 decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
        if a.shouldPerformDownload { return decisionHandler(.download, preferences) }
        if let u = a.request.url, let s = u.scheme?.lowercased(), s == "http" || s == "https",
           u.host != "127.0.0.1", a.targetFrame?.isMainFrame ?? true {
            NSWorkspace.shared.open(u)
            return decisionHandler(.cancel, preferences)
        }
        decisionHandler(.allow, preferences)
    }
    func webView(_ webView: WKWebView, decidePolicyFor r: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(r.canShowMIMEType ? .allow : .download)
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        runSelfTestIfAsked()
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    // MARK: downloads → Movies/Ether Explains
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let fm = FileManager.default
        try? fm.createDirectory(at: Paths.saveDir, withIntermediateDirectories: true)
        let clean = suggestedFilename.isEmpty ? "ether-explains" : suggestedFilename
        let ext = (clean as NSString).pathExtension, stem = (clean as NSString).deletingPathExtension
        var url = Paths.saveDir.appendingPathComponent(clean)
        var n = 2
        while fm.fileExists(atPath: url.path) {
            url = Paths.saveDir.appendingPathComponent(ext.isEmpty ? "\(stem) \(n)" : "\(stem) \(n).\(ext)"); n += 1
        }
        downloads[ObjectIdentifier(download)] = url
        completionHandler(url)
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let url = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        let name = url.lastPathComponent.replacingOccurrences(of: "'", with: "\\'")
        web.evaluateJavaScript("window.EtherNativeSaved && window.EtherNativeSaved('\(name)')")
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: ObjectIdentifier(download))
        let msg = error.localizedDescription.replacingOccurrences(of: "'", with: " ")
        web.evaluateJavaScript("window.EE && EE.toast('Saving failed: \(msg)')")
    }

    // MARK: panels the page asks for
    func webView(_ webView: WKWebView, runOpenPanelWith p: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = p.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        if let w = webView.window { panel.beginSheetModal(for: w) { completionHandler($0 == .OK ? panel.urls : nil) } }
        else { completionHandler(panel.runModal() == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "OK"); a.runModal(); completionHandler()
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let a = NSAlert(); a.messageText = prompt
        let f = NSTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 24)); f.stringValue = defaultText ?? ""
        a.accessoryView = f; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn ? f.stringValue : nil)
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == "127.0.0.1" ? .grant : .prompt)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for a: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url { NSWorkspace.shared.open(u) }
        return nil
    }

    private func nativeLog(_ line: String) {
        let u = Paths.saveDir.appendingPathComponent(".selftest.log")
        let l = line + "\n"
        if let h = try? FileHandle(forWritingTo: u) { h.seekToEndOfFile(); h.write(Data(l.utf8)); try? h.close() }
    }
    private func heartbeat(_ n: Int) {
        guard n < 60 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self = self else { return }
            let w = self.web.window
            let vis = (w?.occlusionState.contains(.visible) ?? false)
            let scr = w?.screen?.localizedName ?? "none"
            var answered = false
            self.web.evaluateJavaScript("Math.round(performance.now())") { r, _ in answered = true
                self.nativeLog("beat \(n): page=\(r ?? "nil") windowVisible=\(vis) active=\(NSApp.isActive) screen=\(scr)") }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) { if !answered { self.nativeLog("beat \(n): PAGE NOT ANSWERING windowVisible=\(vis) active=\(NSApp.isActive) screen=\(scr)") } }
            self.heartbeat(n + 1)
        }
    }

    // MARK: self-test (only when Movies/Ether Explains/.selftest.js has content)
    private func runSelfTestIfAsked() {
        if selfTestRan { return }
        let u = Paths.saveDir.appendingPathComponent(".selftest.js")
        guard let js = try? String(contentsOf: u, encoding: .utf8), !js.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        selfTestRan = true
        NSApp.activate(ignoringOtherApps: true)
        web.window?.makeKeyAndOrderFront(nil)
        let prefs = web.configuration.preferences
        nativeLog("native: hiddenTimerSel=\(prefs.responds(to: NSSelectorFromString("_setHiddenPageDOMTimerThrottlingEnabled:"))) suspendSel=\(prefs.responds(to: NSSelectorFromString("_setPageVisibilityBasedProcessSuspensionEnabled:"))) occlSel=\(web.responds(to: NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")))")
        web.evaluateJavaScript(js)
        heartbeat(0)
    }
}
