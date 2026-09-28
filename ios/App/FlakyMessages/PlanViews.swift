import SwiftUI

private let coral = Color(Brand.coral)

/// Drawer view: pencil in a plan for this chat.
struct ComposeView: View {
    let size: Int
    let onCreated: (PlanLink) -> Void

    @State private var date = Date()
    @State private var timeOfDay: TimeOfDay?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add a no-guilt exit to your plans")
                .font(.headline)

            DatePicker("Day", selection: $date, in: Calendar.current.startOfDay(for: Date())..., displayedComponents: .date)

            Picker("Time", selection: $timeOfDay) {
                Text("Any time").tag(TimeOfDay?.none)
                ForEach(TimeOfDay.allCases) { Text($0.label).tag(TimeOfDay?.some($0)) }
            }
            .pickerStyle(.segmented)

            if let error {
                Text(error).font(.footnote).foregroundColor(.red)
            }

            Button(action: create) {
                HStack {
                    Spacer()
                    if busy { ProgressView().tint(.white) } else { Text("Add to chat").bold() }
                    Spacer()
                }
                .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .tint(coral)
            .disabled(busy)

            Text(size == 2
                 ? "You'll both be able to flake secretly."
                 : "All \(size) of you can flake secretly. It's only off if everyone does.")
                .font(.footnote)
                .foregroundColor(.secondary)
        }
        .padding()
    }

    private func create() {
        busy = true
        error = nil
        let day = PlanDate.ymdString(date)
        Task { @MainActor in
            defer { busy = false }
            do {
                let id = try await FlakyAPI.createPlan(date: day, timeOfDay: timeOfDay, size: size)
                onCreated(PlanLink(id: id, date: day, timeOfDay: timeOfDay, size: size))
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// Opened by tapping a plan bubble: flake secretly, or see that the plan's off.
struct PlanView: View {
    let link: PlanLink
    let voter: UUID
    /// Called with the "plan's off" link when this person's flake was the last.
    let onAllFlaked: (PlanLink) -> Void

    @State private var youFlaked = false
    @State private var cancelled = false
    @State private var loaded = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 14) {
            Text(cancelled ? "🎉" : "🫶").font(.system(size: 48))
            Text(link.label).font(.headline)

            if !loaded {
                ProgressView()
            } else if cancelled {
                Text("Plan's off. Everyone flaked, so nobody bailed on anybody.")
                    .multilineTextAlignment(.center)
            } else if youFlaked {
                Text("You've secretly flaked. If everyone else does too, the plan's off and we'll tell the chat. If not, nobody ever knows.")
                    .multilineTextAlignment(.center)
                Button("Actually, I'm in") { set(false) }
                    .disabled(busy)
            } else {
                Text("Need out? Flake secretly. Nobody finds out unless everyone does.")
                    .multilineTextAlignment(.center)
                Button(action: { set(true) }) {
                    HStack {
                        Spacer()
                        if busy { ProgressView().tint(.white) } else { Text("Flake secretly").bold() }
                        Spacer()
                    }
                    .padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .tint(coral)
                .disabled(busy)
            }

            if let error {
                Text(error).font(.footnote).foregroundColor(.red)
            }
        }
        .padding()
        .task { await load() }
    }

    @MainActor private func load() async {
        if link.cancelled {
            cancelled = true
            loaded = true
            return
        }
        do {
            let status = try await FlakyAPI.status(planId: link.id, voter: voter)
            youFlaked = status.youFlaked
            cancelled = status.cancelled
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    private func set(_ flaked: Bool) {
        busy = true
        error = nil
        Task { @MainActor in
            defer { busy = false }
            do {
                let status = try await FlakyAPI.setFlake(planId: link.id, voter: voter, flaked: flaked)
                youFlaked = status.youFlaked
                cancelled = status.cancelled
                if status.announce == true {
                    var off = link
                    off.cancelled = true
                    onAllFlaked(off)
                }
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
