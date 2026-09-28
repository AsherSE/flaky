import Foundation

/// The three calls the drawer app makes. See src/app/api/imessage on the web side.
///
/// No sign-in: Messages never tells an extension anyone's phone number, so the
/// voter id is the conversation's `localParticipantIdentifier`, an opaque UUID
/// that is stable for this person on this device.
enum FlakyAPI {
    /// Override with a `FlakyAPIBase` string in the extension's Info.plist to
    /// point at a local or preview server.
    static let base: URL = {
        let custom = Bundle.main.object(forInfoDictionaryKey: "FlakyAPIBase") as? String
        return custom.flatMap(URL.init(string:)) ?? URL(string: "https://flaky.me")!
    }()

    struct Status: Decodable {
        let youFlaked: Bool
        let cancelled: Bool
        /// Only on a flake: true for exactly one person, the one whose flake
        /// completed the set. Their device posts the "plan's off" bubble.
        let announce: Bool?
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    static func createPlan(date: String, timeOfDay: TimeOfDay?, size: Int) async throws -> String {
        struct Created: Decodable { let id: String }
        var body: [String: Any] = ["date": date, "size": size]
        if let timeOfDay { body["timeOfDay"] = timeOfDay.rawValue }
        let created: Created = try await send("POST", "/api/imessage/plans", body: body)
        return created.id
    }

    static func status(planId: String, voter: UUID) async throws -> Status {
        let voterItem = URLQueryItem(name: "voter", value: voter.uuidString)
        return try await send("GET", "/api/imessage/plans/\(planId)", query: [voterItem])
    }

    static func setFlake(planId: String, voter: UUID, flaked: Bool) async throws -> Status {
        try await send(
            "POST",
            "/api/imessage/plans/\(planId)",
            body: ["voter": voter.uuidString, "flaked": flaked]
        )
    }

    private static func send<T: Decodable>(
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        body: [String: Any]? = nil
    ) async throws -> T {
        var parts = URLComponents(url: base, resolvingAgainstBaseURL: false)!
        parts.path = path
        if !query.isEmpty { parts.queryItems = query }

        var request = URLRequest(url: parts.url!)
        request.httpMethod = method
        request.timeoutInterval = 15
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            struct ErrorBody: Decodable { let error: String }
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
            throw Failure(message: message ?? "Something went wrong (\(code)). Try again?")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
