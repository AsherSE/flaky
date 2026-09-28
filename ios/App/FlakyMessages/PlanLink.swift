import Foundation

/// A plan as it travels inside an iMessage bubble.
///
/// Everything needed to draw the plan lives in the message URL, so the bubble
/// renders instantly and offline. The server only holds who secretly flaked:
///
///     https://flaky.me/i/{id}?d=2026-10-03&t=night&n=3
///
/// The same URL is what Android and Mac recipients see, and `/i/{id}` on the
/// website explains the plan to them.
struct PlanLink: Equatable {
    var id: String
    /// YYYY-MM-DD, the plan's calendar day.
    var date: String
    var timeOfDay: TimeOfDay?
    /// Everyone in the conversation when the plan was dropped in.
    var size: Int
    /// True once everyone has flaked; set on the "plan's off" bubble.
    var cancelled = false

    init(id: String, date: String, timeOfDay: TimeOfDay?, size: Int, cancelled: Bool = false) {
        self.id = id
        self.date = date
        self.timeOfDay = timeOfDay
        self.size = size
        self.cancelled = cancelled
    }

    init?(url: URL?) {
        guard let url,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return nil }
        let path = url.pathComponents
        guard path.count == 3, path[1] == "i", !path[2].isEmpty else { return nil }
        let query = Dictionary(
            (parts.queryItems ?? []).map { ($0.name, $0.value ?? "") },
            uniquingKeysWith: { first, _ in first }
        )
        guard let date = query["d"], let size = query["n"].flatMap(Int.init) else { return nil }
        self.id = path[2]
        self.date = date
        self.timeOfDay = query["t"].flatMap(TimeOfDay.init(rawValue:))
        self.size = size
        self.cancelled = query["off"] == "1"
    }

    var url: URL {
        var parts = URLComponents(url: FlakyAPI.base, resolvingAgainstBaseURL: false)!
        parts.path = "/i/\(id)"
        let items: [URLQueryItem?] = [
            URLQueryItem(name: "d", value: date),
            timeOfDay.map { URLQueryItem(name: "t", value: $0.rawValue) },
            URLQueryItem(name: "n", value: String(size)),
            cancelled ? URLQueryItem(name: "off", value: "1") : nil,
        ]
        parts.queryItems = items.compactMap { $0 }
        return parts.url!
    }

    /// "Sat 3 Oct" plus the time of day, in the reader's own locale.
    var label: String {
        let day = PlanDate.display(date)
        guard let timeOfDay else { return day }
        return "\(day) · \(timeOfDay.label)"
    }
}

enum TimeOfDay: String, CaseIterable, Identifiable {
    case morning, lunch, night
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

enum PlanDate {
    private static let ymd: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static let pretty: DateFormatter = {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("EEEMMMd")
        return f
    }()

    /// The user's own calendar day, which is what the server validates against.
    static func ymdString(_ date: Date) -> String { ymd.string(from: date) }

    static func display(_ ymdString: String) -> String {
        guard let date = ymd.date(from: ymdString) else { return ymdString }
        return pretty.string(from: date)
    }
}
