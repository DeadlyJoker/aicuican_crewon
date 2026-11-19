"""Generate the local development package index from workspace manifests."""

import json
from pathlib import Path


def main():
    """Write a deterministic index without importing or executing packages."""
    root = Path(__file__).resolve().parents[2]
    patterns = ("package.json", "packages/*/*/package.json", "apps/*/package.json", "vendor/*/package.json", "native/system/package.json", "native/system/packages/*/package.json", "website/package.json", "benchmarks/package.json", "python/sdk-runtime/package.json")
    paths = sorted({path for pattern in patterns for path in root.glob(pattern)})
    rows = []
    for path in paths:
        manifest = json.loads(path.read_text())
        rows.append({
            "name": manifest.get("name"),
            "path": str(path.parent.relative_to(root)),
            "version": manifest.get("version"),
            "private": manifest.get("private", False),
            "description": manifest.get("description"),
            "dsh": manifest.get("dsh"),
            "exports": manifest.get("exports"),
            "dependencies": manifest.get("dependencies", {}),
            "peerDependencies": manifest.get("peerDependencies", {}),
            "devDependencies": manifest.get("devDependencies", {}),
        })
    output = root / "dev-notes/generated/packages.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"schemaVersion": 1, "packages": rows}, ensure_ascii=False, indent=2) + "\n")
    print(f"Indexed {len(rows)} workspace manifests in {output.relative_to(root)}")


if __name__ == "__main__":
    main()
