/**
 * Syncs iOS with a dev server URL the simulator/device can reach.
 * localhost inside the app is NOT your Mac — use this machine's LAN IP.
 */
const { networkInterfaces } = require("os");
const { execSync } = require("child_process");

function firstLanIPv4() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net && net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

const ip = firstLanIPv4();
const url = `http://${ip}:3000`;

console.log("");
console.log("Capacitor will load:", url);
console.log("Start Next with: npm run dev:lan  (so it listens on all interfaces)");
console.log("");

execSync("npx cap sync ios", {
  stdio: "inherit",
  env: { ...process.env, CAPACITOR_SERVER_URL: url },
});
