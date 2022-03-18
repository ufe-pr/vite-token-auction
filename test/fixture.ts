const vite = require("@vite/vuilder");
import nodeCfg from "./vite.node.json";

vite.loadViteConfig(nodeCfg);
let node;

export async function mochaGlobalSetup() {
  node = await vite.startLocalNetwork(nodeCfg);
  console.log("Test environment is ready.");
}
export async function mochaGlobalTeardown() {
  await node.stop();
  console.log("Test environment cleared.");
  process.exit();
}
