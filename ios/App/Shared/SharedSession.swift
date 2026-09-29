import Foundation
import Security

/// The signed-in session token, kept in a keychain group shared by the app and
/// its iMessage extension. The app's web view owns sign-in; the extension only
/// ever reads what the app last wrote here.
enum SharedSession {
    private static let service = "app.flaky.session"
    private static let account = "token"

    /// `$(AppIdentifierPrefix)app.flaky.shared`, resolved at build time into
    /// each target's Info.plist so both sides agree on the full group name.
    private static var accessGroup: String? {
        Bundle.main.object(forInfoDictionaryKey: "FlakyKeychainGroup") as? String
    }

    private static func baseQuery() -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let group = accessGroup { query[kSecAttrAccessGroup as String] = group }
        return query
    }

    static var token: String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data,
              let value = String(data: data, encoding: .utf8),
              !value.isEmpty
        else { return nil }
        return value
    }

    static func set(_ token: String?) {
        SecItemDelete(baseQuery() as CFDictionary)
        guard let token = token, !token.isEmpty else { return }
        var query = baseQuery()
        query[kSecValueData as String] = Data(token.utf8)
        // Readable while the phone is locked-after-first-unlock, which is when
        // Messages may spin the extension up.
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(query as CFDictionary, nil)
    }
}
