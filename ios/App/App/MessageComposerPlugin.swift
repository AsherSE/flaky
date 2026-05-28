import Capacitor
import MessageUI
import UIKit

/// Opens the native Messages compose sheet pre-filled with a body and
/// recipients. Pre-filling the exact participant set lets iMessage route the
/// message into the user's existing group thread rather than starting a new
/// one — so a flaky invite lands "in the same chain" they already have.
@objc(MessageComposerPlugin)
public class MessageComposerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MessageComposerPlugin"
    public let jsName = "MessageComposer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "canSend", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "compose", returnType: CAPPluginReturnPromise),
    ]

    private var pendingCall: CAPPluginCall?

    @objc func canSend(_ call: CAPPluginCall) {
        call.resolve(["available": MFMessageComposeViewController.canSendText()])
    }

    @objc func compose(_ call: CAPPluginCall) {
        guard MFMessageComposeViewController.canSendText() else {
            call.resolve(["result": "unavailable"])
            return
        }

        let body = call.getString("body") ?? ""
        let recipients = (call.getArray("recipients", String.self)) ?? []

        // Only one compose sheet at a time.
        if pendingCall != nil {
            call.resolve(["result": "unavailable"])
            return
        }
        pendingCall = call

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let composer = MFMessageComposeViewController()
            composer.messageComposeDelegate = self
            composer.body = body
            if !recipients.isEmpty {
                composer.recipients = recipients
            }
            guard let vc = self.bridge?.viewController else {
                self.pendingCall = nil
                call.resolve(["result": "unavailable"])
                return
            }
            vc.present(composer, animated: true)
        }
    }
}

extension MessageComposerPlugin: MFMessageComposeViewControllerDelegate {
    public func messageComposeViewController(
        _ controller: MFMessageComposeViewController,
        didFinishWith result: MessageComposeResult
    ) {
        let call = pendingCall
        pendingCall = nil
        controller.dismiss(animated: true) {
            let value: String
            switch result {
            case .sent: value = "sent"
            case .cancelled: value = "cancelled"
            case .failed: value = "failed"
            @unknown default: value = "failed"
            }
            call?.resolve(["result": value])
        }
    }
}
