import UIKit
import Capacitor

class MyViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ContactPickerPlugin())
        // Without this the JS `registerPlugin("MessageComposer")` call resolves
        // to nothing, compose() throws, and "Send to group" reports that it
        // couldn't open Messages — on every device, not just the simulator.
        bridge?.registerPluginInstance(MessageComposerPlugin())
    }
}
