---
name: Package install firewall
description: Imported pnpm workspaces may fail before verification when the Replit package firewall denies a dependency tarball.
---

When dependency installation is blocked by the package firewall, preserve the existing lockfile and source structure, report the verification limitation clearly, and avoid changing dependency versions just to force a local install.

**Why:** The imported workspace’s declared dependencies were intact, but the environment denied the `tsx` tarball, leaving all workflows unable to start.

**How to apply:** Retry installation through the supported package-management flow or resolve the environment access issue before changing package manifests.