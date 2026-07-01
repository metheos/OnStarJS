import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";

const assets = [
  {
    from: join("src", "auth", "zendriverAuth.py"),
    to: join("dist", "auth", "zendriverAuth.py"),
  },
];

for (const asset of assets) {
  mkdirSync(dirname(asset.to), { recursive: true });
  copyFileSync(asset.from, asset.to);
}
