import Capacitor

/// Lets the web app hand its session token to native code, so the iMessage
/// extension can pencil in plans as the signed-in user.
@objc(SharedSessionPlugin)
public class SharedSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedSessionPlugin"
    public let jsName = "SharedSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    ]

    @objc func set(_ call: CAPPluginCall) {
        SharedSession.set(call.getString("token"))
        call.resolve()
    }
}
