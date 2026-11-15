// Ether Explains — native Mac app.
// The studio UI (Studio, Voice, Ether's Cut) runs in a WKWebView served from inside the app on 127.0.0.1,
// and the Mac side adds what a browser can't: Mac voices rendered into real voice tracks, saving straight
// to Movies/Ether Explains, the microphone, and offline three.js.
import SwiftUI
import AppKit
import WebKit

@main
struct EtherExplainsApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        WindowGroup("Ether Explains") {
            WebHost()
                .frame(minWidth: 1100, minHeight: 720)
                .background(Color(red: 0.027, green: 0.024, blue: 0.059))
        }
        .defaultSize(width: 1500, height: 940)
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandGroup(after: .newItem) {
                Button("Open Saved Videos Folder") { NSWorkspace.shared.open(Paths.saveDir) }
                    .keyboardShortcut("o", modifiers: [.command, .shift])
            }
            CommandGroup(after: .toolbar) {
                Button("Reload Studio") { WebController.shared?.reload() }
                    .keyboardShortcut("r", modifiers: [.command])
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var activity: NSObjectProtocol?
    func applicationDidFinishLaunching(_ notification: Notification) {
        // no App Nap: playback and recording keep real time even when the app isn't in front
        activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiatedAllowingIdleSystemSleep, .latencyCritical],
                                                         reason: "Playing and recording explainers")
        try? FileManager.default.createDirectory(at: Paths.saveDir, withIntermediateDirectories: true)
        _ = LocalServer.shared.start()
        ClaudeCode.stopLeftovers()
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { ClaudeCode.shared.stop(); LocalAI.shared.stop() }
}

enum Paths {
    static let saveDir: URL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Movies", isDirectory: true)
        .appendingPathComponent("Ether Explains", isDirectory: true)
    static let webRoot: URL = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
    static let tmpDir: URL = {
        let u = FileManager.default.temporaryDirectory.appendingPathComponent("EtherExplainsVoices", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }()
}

struct WebHost: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView {
        let c = WebController()
        context.coordinator.controller = c
        return c.web
    }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
    func makeCoordinator() -> Holder { Holder() }
    final class Holder { var controller: WebController? }
}
