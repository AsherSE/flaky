import Capacitor
import ContactsUI

@objc(ContactPickerPlugin)
public class ContactPickerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ContactPickerPlugin"
    public let jsName = "ContactPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickPhone", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?

    @objc func pickPhone(_ call: CAPPluginCall) {
        pendingCall = call

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let picker = CNContactPickerViewController()
            picker.delegate = self
            picker.displayedPropertyKeys = [CNContactPhoneNumbersKey]
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }
}

extension ContactPickerPlugin: CNContactPickerDelegate {
    public func contactPicker(_ picker: CNContactPickerViewController,
                              didSelect contactProperty: CNContactProperty) {
        guard let phoneNumber = contactProperty.value as? CNPhoneNumber else {
            pendingCall?.resolve(["phone": ""])
            pendingCall = nil
            return
        }
        pendingCall?.resolve(["phone": phoneNumber.stringValue])
        pendingCall = nil
    }

    public func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
        pendingCall?.resolve(["phone": ""])
        pendingCall = nil
    }
}
