# exec-near

> Run commands in the directory of the nearest matching file.

[![License](https://img.shields.io/github/license/idleberg/node-exec-near?color=blue&style=for-the-badge)](https://github.com/idleberg/node-exec-near/blob/main/LICENSE)
[![Version: npm](https://img.shields.io/npm/v/exec-near?style=for-the-badge)](https://www.npmjs.org/package/exec-near)
![GitHub branch check runs](https://img.shields.io/github/check-runs/idleberg/node-exec-near/main?style=for-the-badge)

## Installation 💿

```shell
npm install exec-near
```

## Usage 🚀

```shell
# Run Prettier in package folders with prettier.config.js
npx exec-near --with packages/**/*.ts --find prettier.config.js -- prettier --check --write

# Run Biome in package folders with biome.json
npx exec-near --with packages/**/*.ts --find biome.json -- biome check --write
```

See `npx exec-near --help` for all available options.

## License

This work is licensed under [The MIT License](LICENSE).
