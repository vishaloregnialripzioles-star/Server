---
name: Package install firewall
description: Imported pnpm workspaces may fail before verification when the Replit package firewall denies a dependency tarball.
---

When dependency installation is temporarily blocked by the package firewall, preserve the existing lockfile and source structure, retry the supported install later, and avoid changing dependency versions just to force a local install. The bot also expects Python only for optional yt-dlp music support.

**Why:** The imported workspace’s declared dependencies were intact; an initial firewall denial left workflows without packages, while the later install succeeded. The Discord bot itself runs without Python, but yt-dlp does not.

**How to apply:** Retry installation through the supported package-management flow or resolve the environment access issue before changing package manifests.