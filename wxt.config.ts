import { defineConfig } from "wxt";
import { ALLOWED_HOST_MATCHES, OPTIONAL_HOST_MATCHES } from "./utils/allowed-origins";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "BugTrail",
    description: "Turn QA clicks into developer-ready bug trails.",
    version: "0.1.0",
    permissions: ["storage", "sidePanel", "scripting", "activeTab", "tabs", "webRequest"],
    host_permissions: [...ALLOWED_HOST_MATCHES],
    optional_host_permissions: [...OPTIONAL_HOST_MATCHES],
    web_accessible_resources: [
      {
        resources: ["page-bridge.js"],
        matches: [...ALLOWED_HOST_MATCHES, ...OPTIONAL_HOST_MATCHES],
      },
    ],
    action: {
      default_title: "Open BugTrail",
      default_icon: {
        "16": "assets/icon-16.png",
        "32": "assets/icon-32.png",
        "48": "assets/icon-48.png",
        "128": "assets/icon-128.png",
      },
    },
    icons: {
      "16": "assets/icon-16.png",
      "32": "assets/icon-32.png",
      "48": "assets/icon-48.png",
      "128": "assets/icon-128.png",
    },
    side_panel: {
      default_path: "sidepanel.html",
    },
  },
});
