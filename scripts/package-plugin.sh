#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
version="$(node -p "require('./package.json').version")"
mode="${1:---thin}"
case "$mode" in
    --thin)
        artifact="${2:-$(pwd)/out/Decky.Language.Tutor-v$version.zip}"
        ;;
    --full)
        dependencies="${2:-plugin-dependencies.tar.gz}"
        artifact="${3:-$(pwd)/out/Decky.Language.Tutor.Full-v$version.zip}"
        test -f "$dependencies" || { echo "Missing $dependencies. Build the Linux dependency archive first." >&2; exit 1; }
        ;;
    *)
        echo "Usage: $0 --thin [output.zip] | --full [dependencies.tar.gz] [output.zip]" >&2
        exit 1
        ;;
esac

test -f dist/index.js || { echo "Run pnpm build first." >&2; exit 1; }
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

plugin="$stage/decky-language-tutor"
mkdir -p "$plugin/py_modules" "$(dirname "$artifact")"
cp main.py package.json plugin.json README.md LICENSE THIRD_PARTY_LICENSES "$plugin/"
cp -R dist "$plugin/"
cp -R py_modules/providers "$plugin/py_modules/"

if [[ "$mode" == --full ]]; then
    mkdir "$plugin/bin"
    cp "$dependencies" "$plugin/bin/plugin-dependencies.tar.gz"
fi

node --input-type=module - "$plugin/package.json" "$mode" <<'JS'
import { readFileSync, writeFileSync } from "node:fs";

const [, , manifest, mode] = process.argv;
const pkg = JSON.parse(readFileSync(manifest, "utf8"));

if (mode === "--full") {
    delete pkg.remote_binary;
} else {
    const url = process.env.DECKY_DEPENDENCIES_URL;
    const checksum = process.env.DECKY_DEPENDENCIES_SHA256;
    if (url !== undefined || checksum !== undefined) {
        pkg.remote_binary = [{ name: "plugin-dependencies.tar.gz", url, sha256hash: checksum }];
    }
    const [binary] = pkg.remote_binary ?? [];
    if (pkg.remote_binary?.length !== 1 || binary?.name !== "plugin-dependencies.tar.gz"
        || !URL.canParse(binary.url) || new URL(binary.url).protocol !== "https:"
        || !/^[a-f\d]{64}$/i.test(binary.sha256hash)) {
        throw new Error("The thin ZIP requires an HTTPS dependency URL and its SHA-256.");
    }
}

writeFileSync(manifest, JSON.stringify(pkg, null, 2) + "\n");
JS

(
    cd "$stage"
    zip -q -r Decky.Language.Tutor.zip decky-language-tutor \
        -x '*/__pycache__/*' '*/__pycache__/' '*.pyc' '*/.DS_Store'
)
mv "$stage/Decky.Language.Tutor.zip" "$artifact"
echo "$artifact"
