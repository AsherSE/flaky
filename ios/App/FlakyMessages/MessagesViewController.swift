import Messages
import SwiftUI
import UIKit

/// The flaky app in the Messages app drawer. Pick a day, tap "Pencil in", and
/// an invite link drops into the conversation. Everyone in the chat who taps
/// it joins the plan — the link is plain text, so it works for green bubbles
/// and people without the app too.
class MessagesViewController: MSMessagesAppViewController {
    private let model = PencilInModel()
    private var host: UIHostingController<PencilInView>?

    override func viewDidLoad() {
        super.viewDidLoad()
        model.requestExpanded = { [weak self] in
            self?.requestPresentationStyle(.expanded)
        }
        model.openApp = { [weak self] in
            guard let url = URL(string: "flaky://") else { return }
            self?.extensionContext?.open(url, completionHandler: nil)
        }
        model.insertInvite = { [weak self] text in
            guard let conversation = self?.activeConversation else { return }
            conversation.insertText(text) { _ in
                self?.dismiss()
            }
        }

        let host = UIHostingController(rootView: PencilInView(model: model))
        host.view.backgroundColor = .clear
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)
        self.host = host
    }

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        // Re-read every time: the user may have signed in or out in the app
        // since Messages last showed us.
        model.reload(expanded: presentationStyle == .expanded)
    }

    override func willTransition(to presentationStyle: MSMessagesAppPresentationStyle) {
        super.willTransition(to: presentationStyle)
        model.expanded = presentationStyle == .expanded
    }
}

// MARK: - Model

enum TimeOfDay: String, CaseIterable, Identifiable {
    case morning, lunch, night
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    var symbol: String {
        switch self {
        case .morning: return "sunrise"
        case .lunch: return "sun.max"
        case .night: return "moon"
        }
    }
}

@MainActor
final class PencilInModel: ObservableObject {
    @Published var signedIn = SharedSession.token != nil
    @Published var expanded = false
    @Published var date = Calendar.current.startOfDay(for: Date())
    @Published var timeOfDay: TimeOfDay?
    @Published var busy = false
    @Published var error: String?

    var requestExpanded: () -> Void = {}
    var openApp: () -> Void = {}
    var insertInvite: (String) -> Void = { _ in }

    let today = Calendar.current.startOfDay(for: Date())
    var lastDay: Date { Calendar.current.date(byAdding: .day, value: 90, to: today) ?? today }

    func reload(expanded: Bool) {
        signedIn = SharedSession.token != nil
        self.expanded = expanded
        error = nil
    }

    private static var serverURL: URL {
        let raw = Bundle.main.object(forInfoDictionaryKey: "FlakyServerURL") as? String
        return URL(string: raw ?? "") ?? URL(string: "https://flaky.me")!
    }

    private static func ymd(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }


    func pencilIn() async {
        guard let token = SharedSession.token else {
            signedIn = false
            return
        }
        busy = true
        error = nil
        defer { busy = false }

        var request = URLRequest(url: Self.serverURL.appendingPathComponent("api/flake"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        var body: [String: Any] = [
            "date": Self.ymd(date),
            "targetPhones": [String](),
            "tz": TimeZone.current.identifier,
        ]
        if let tod = timeOfDay { body["timeOfDay"] = tod.rawValue }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            if status == 401 {
                // Session expired; the app will sign in again and hand us a new one.
                SharedSession.set(nil)
                signedIn = false
                return
            }
            guard status == 200, let url = json?["inviteUrl"] as? String else {
                error = (json?["error"] as? String) ?? "Something went wrong. Try again."
                return
            }
            // Just the link: Messages renders it as a preview card whose title
            // already says who penciled in which day.
            insertInvite(url)
        } catch {
            self.error = "Couldn’t reach flaky. Check your connection."
        }
    }
}

// MARK: - View

private let accent = Color(red: 0xE0 / 255, green: 0x7A / 255, blue: 0x5F / 255)
private let ink = Color(red: 0x3D / 255, green: 0x3D / 255, blue: 0x3D / 255)

struct PencilInView: View {
    @ObservedObject var model: PencilInModel

    var body: some View {
        Group {
            if !model.signedIn {
                signedOut
            } else if !model.expanded {
                compact
            } else {
                expanded
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 20)
    }

    private var signedOut: some View {
        VStack(spacing: 12) {
            Text("Sign in to flaky first")
                .font(.headline)
            Text("Open the app and verify your number, then come back here to pencil in plans.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            Button("Open flaky", action: model.openApp)
                .buttonStyle(FilledButton())
        }
    }

    private var compact: some View {
        VStack(spacing: 12) {
            Text("Pencil in plans")
                .font(.headline)
            Text("Pick a day and drop an invite in this chat. Anyone who taps it joins.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
            Button("Pick a day", action: model.requestExpanded)
                .buttonStyle(FilledButton())
        }
    }

    private var expanded: some View {
        ScrollView {
            VStack(spacing: 16) {
                Text("What day?")
                    .font(.headline)
                    .frame(maxWidth: .infinity, alignment: .leading)
                DatePicker(
                    "Day",
                    selection: $model.date,
                    in: model.today...model.lastDay,
                    displayedComponents: .date
                )
                .datePickerStyle(.graphical)
                .tint(accent)
                .labelsHidden()

                HStack(spacing: 8) {
                    ForEach(TimeOfDay.allCases) { tod in
                        let selected = model.timeOfDay == tod
                        Button {
                            model.timeOfDay = selected ? nil : tod
                        } label: {
                            Label(tod.label, systemImage: tod.symbol)
                                .font(.subheadline.weight(.medium))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                                .foregroundColor(selected ? .white : ink)
                                .background(
                                    RoundedRectangle(cornerRadius: 12)
                                        .fill(selected ? accent : Color(.secondarySystemBackground))
                                )
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }

                if let error = model.error {
                    Text(error)
                        .font(.footnote)
                        .foregroundColor(.red)
                        .multilineTextAlignment(.center)
                }

                Button {
                    Task { await model.pencilIn() }
                } label: {
                    Text(model.busy ? "…" : "Pencil in")
                }
                .buttonStyle(FilledButton())
                .disabled(model.busy)
            }
            .padding(.vertical, 20)
        }
    }
}

private struct FilledButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(accent.opacity(configuration.isPressed ? 0.8 : 1))
            )
    }
}
