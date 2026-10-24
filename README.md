# pico⚡flash

Use [pico⚡flash](https://picoflash.org) to flash your Raspberry Pi Pico microcontroller directly from your web browser using WebUSB.

Requires Chrome, Edge or another Chromium-based browser with WebUSB support.

Works on Windows, macOS, Linux and Android.

As well as a [website](https://picoflash.org) pico⚡flash is a full Javascript implementation of Raspberry Pi's PICOBOOT protocol, for flashing and managing RP2040 and RP2350 microcontrollers over USB.

## Features

- Read, write and erase flash memory
- Reset and reboot the device
- Enter and exit XIP mode (RP2040 only)
- Exclusive access mode to prevent other software from interfering
- Read and write OTP (One-Time Programmable) memory
- Supports RP2040 and RP2350 microcontrollers
- Supports custom VID/PID devices (OTP programmed)
- Web front-end and comprehensive JavaScript API
- Full error handling
- Detailed console logging

## Using the library

Import it from picoflash.org:

- `https://picoflash.org/releases/vX.Y.Z/pkg/picoboot.js` is release X.Y.Z and doesn't change.
- `https://picoflash.org/pkg/picoboot.js` is the latest commit to `main`.

## Testing

```bash
node tests/mock-device.mjs
```

This tests flash command chunking and transfer timeouts against a mock PICOBOOT device. The deploy workflow runs it before publishing.

## Releasing

1. Run the tests.
2. Set the version in `pkg/package.json`.
3. Date the version's heading in `CHANGELOG.md`.
4. Commit and push to `main`. The deploy workflow publishes the site to the root of picoflash.org.
5. Tag the release with `git tag vX.Y.Z` and push the tag. The deploy workflow publishes the site to `picoflash.org/releases/vX.Y.Z/`.

The site is served from the `gh-pages` branch. The deploy workflow updates it.

## Links

- [Website](https://picoflash.org)
- [GitHub Repository](https://github.com/picoflash/picoflash)
- [piers.rocks YouTube Channel](https://www.youtube.com/@piers_rocks)

## License

[MIT License](LICENSE) - Copyright (C) 2025 Piers Finlayson
