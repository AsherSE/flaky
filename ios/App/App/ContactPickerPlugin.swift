import Capacitor
import Contacts
import ContactsUI
import UIKit

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
            // Prefer immediate selection; avoids drilling into contact detail (esp. when browsing).
            // Search can still misbehave on some iOS versions (ContactsUI quirk).
            picker.predicateForSelectionOfContact = NSPredicate(value: true)
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    private func displayName(for contact: CNContact) -> String {
        let person = CNContactFormatter.string(from: contact, style: .fullName)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !person.isEmpty { return person }
        let org = contact.organizationName.trimmingCharacters(in: .whitespacesAndNewlines)
        return org
    }

    private func labeledPhonePairs(from contact: CNContact) -> [(label: String, value: String)] {
        var seen = Set<String>()
        var out: [(String, String)] = []
        for labeled in contact.phoneNumbers {
            guard let num = labeled.value as? CNPhoneNumber else { continue }
            let raw = num.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if raw.isEmpty { continue }
            if !seen.insert(raw).inserted { continue }
            let lab = CNLabeledValue<CNPhoneNumber>.localizedString(forLabel: labeled.label ?? "")
            out.append((lab, raw))
        }
        return out
    }

    private func finishPick(contact: CNContact, call: CAPPluginCall) {
        let name = displayName(for: contact)
        let pairs = labeledPhonePairs(from: contact)

        if pairs.isEmpty {
            call.resolve(["phone": "", "displayName": name])
            return
        }
        if pairs.count == 1 {
            call.resolve(["phone": pairs[0].value, "displayName": name])
            return
        }

        guard let vc = bridge?.viewController else {
            call.resolve(["phone": "", "displayName": name])
            return
        }

        let alert = UIAlertController(
            title: NSLocalizedString("Choose a number", comment: ""),
            message: name.isEmpty ? nil : name,
            preferredStyle: .actionSheet
        )
        for p in pairs {
            let title: String
            if p.label.isEmpty {
                title = p.value
            } else {
                title = "\(p.label) · \(p.value)"
            }
            alert.addAction(UIAlertAction(title: title, style: .default) { _ in
                call.resolve(["phone": p.value, "displayName": name])
            })
        }
        alert.addAction(UIAlertAction(title: NSLocalizedString("Cancel", comment: ""), style: .cancel) { _ in
            call.resolve(["phone": "", "displayName": ""])
        })

        if let pop = alert.popoverPresentationController {
            pop.sourceView = vc.view
            pop.sourceRect = CGRect(
                x: vc.view.bounds.midX,
                y: vc.view.bounds.midY,
                width: 0,
                height: 0
            )
            pop.permittedArrowDirections = []
        }

        vc.present(alert, animated: true)
    }
}

extension ContactPickerPlugin: CNContactPickerDelegate {
    public func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        picker.dismiss(animated: true) { [weak self] in
            guard let self = self else {
                call.resolve(["phone": "", "displayName": ""])
                return
            }
            self.finishPick(contact: contact, call: call)
        }
    }

    public func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        picker.dismiss(animated: true) {
            call.resolve(["phone": "", "displayName": ""])
        }
    }
}
