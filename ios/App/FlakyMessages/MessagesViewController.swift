import Messages
import SwiftUI
import UIKit

/// The flaky drawer app.
///
/// Opened from the drawer, it shows the compose view: pick a day, drop a
/// "flaky-protected" bubble into the chat. Opened by tapping that bubble, it
/// shows the plan, where each person can secretly flake. When the last person
/// flakes, their device replaces the bubble with "plan's off" for everyone.
final class MessagesViewController: MSMessagesAppViewController {
    private var hosted: UIViewController?

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        render(conversation)
    }

    override func didSelect(_ message: MSMessage, conversation: MSConversation) {
        super.didSelect(message, conversation: conversation)
        render(conversation)
    }

    private func render(_ conversation: MSConversation) {
        let voter = conversation.localParticipantIdentifier

        if let message = conversation.selectedMessage, let link = PlanLink(url: message.url) {
            show(PlanView(link: link, voter: voter) { [weak self] cancelled in
                self?.announce(cancelled, replacing: message)
            })
            return
        }

        // Headcount now, including me. A 1:1 chat is two people.
        let size = max(2, conversation.remoteParticipantIdentifiers.count + 1)
        show(ComposeView(size: size) { [weak self] link in
            self?.insert(link)
        })
    }

    /// Put the plan bubble in the input field. The user still taps send, so
    /// nothing goes into the chat without them seeing it first.
    private func insert(_ link: PlanLink) {
        guard let conversation = activeConversation else { return }
        conversation.insert(Bubble.message(for: link, session: MSSession())) { error in
            if let error { NSLog("flaky: insert failed: \(error)") }
        }
        requestPresentationStyle(.compact)
    }

    /// Send the "plan's off" bubble in the plan's session, so it replaces the
    /// original rather than adding a second one.
    private func announce(_ link: PlanLink, replacing original: MSMessage) {
        guard let conversation = activeConversation else { return }
        let message = Bubble.message(for: link, session: original.session ?? MSSession())
        conversation.send(message) { error in
            if let error { NSLog("flaky: announce failed: \(error)") }
        }
    }

    private func show<Content: View>(_ content: Content) {
        if let hosted {
            hosted.willMove(toParent: nil)
            hosted.view.removeFromSuperview()
            hosted.removeFromParent()
        }
        let controller = UIHostingController(rootView: content)
        addChild(controller)
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(controller.view)
        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: view.topAnchor),
            controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        controller.didMove(toParent: self)
        hosted = controller
    }
}

/// What the plan looks like in the transcript.
enum Bubble {
    static func message(for link: PlanLink, session: MSSession) -> MSMessage {
        let layout = MSMessageTemplateLayout()
        layout.image = art(link.cancelled ? "🎉" : "🫶")
        if link.cancelled {
            layout.caption = "Plan's off. Everyone flaked."
            layout.subcaption = "\(link.label) · guilt-free, nobody bailed on anybody"
        } else {
            layout.caption = "\(link.label) is flaky-protected"
            layout.subcaption = "Tap to secretly flake. Nobody finds out unless everyone does."
        }

        let message = MSMessage(session: session)
        message.layout = layout
        message.url = link.url
        message.summaryText = link.cancelled
            ? "flaky: plan's off, everyone flaked"
            : "flaky: \(link.label) is flaky-protected"
        return message
    }

    private static func art(_ emoji: String) -> UIImage {
        let size = CGSize(width: 600, height: 300)
        return UIGraphicsImageRenderer(size: size).image { ctx in
            Brand.coral.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            let text = emoji as NSString
            let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 140)]
            let box = text.size(withAttributes: attrs)
            text.draw(
                at: CGPoint(x: (size.width - box.width) / 2, y: (size.height - box.height) / 2),
                withAttributes: attrs
            )
        }
    }
}

enum Brand {
    /// #e07a5f, the website's button colour.
    static let coral = UIColor(red: 224 / 255, green: 122 / 255, blue: 95 / 255, alpha: 1)
}
