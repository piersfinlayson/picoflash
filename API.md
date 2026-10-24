# API

## Examples

See the [examples directory](./examples/) for complete working examples.

## Quick Start

### 1. Basic Usage

```javascript
import { Picoboot } from './picoboot.js';

const picoboot = await Picoboot.requestDevice();

const connection = await picoboot.connect();

await connection.resetInterface();

await connection.setExclusiveAccess(2);
await connection.exitXip();

await connection.flashEraseStart(4096);

const testData = new Uint8Array(256).fill(0x42);
await connection.flashWriteStart(testData);

const data = await connection.flashReadStart(256);
console.log(data);

await connection.reboot(100);

await picoboot.disconnect();
```

### 2. Get Previously Paired Devices

```javascript
import { Picoboot } from './picoboot.js';

const devices = await Picoboot.getDevices();
console.log(`Found ${devices.length} paired device(s)`);

if (devices.length > 0) {
    const picoboot = devices[0];
    const connection = await picoboot.connect();
}
```

### 3. Specify Target Types

```javascript
import { Picoboot, Target } from './picoboot.js';

const targets = [
    new Target('RP2040'),
    new Target('RP2350'),
];

const picoboot = await Picoboot.requestDevice(targets);
```

## API Reference

### Picoboot Class

Main class for device discovery and connection management.

#### Static Methods

**`Picoboot.requestDevice(targets?, timeouts?)`**
- Prompts user to select a PICOBOOT device
- Returns: `Promise<Picoboot>`

**`Picoboot.getDevices(targets?, timeouts?)`**
- Gets all previously paired PICOBOOT devices
- Returns: `Promise<Array<Picoboot>>`

**`Picoboot.fromDevice(device, timeouts?)`**
- Creates a Picoboot instance from a USBDevice
- Returns: `Promise<Picoboot>`

#### Instance Methods

**`connect()`**
- Opens connection to the device
- Returns: `Promise<Connection>`

**`disconnect()`**
- Closes connection to the device
- Returns: `Promise<void>`

**`isConnected()`**
- Returns: `boolean`

**`getConnection()`**
- Returns: `Connection|null`

**`getTarget()`**
- Returns: `Target`

**`getInfo()`**
- Returns: `string` (VID:PID)

**`getUsbDeviceInfo()`**
- Returns: `Object` with `vendorId`, `productId`, `manufacturerName`, `productName`, `serialNumber`, `deviceVersionMajor`, `deviceVersionMinor`, `deviceVersionSubminor`, `usbVersionMajor`, `usbVersionMinor`, `usbVersionSubminor`, `deviceClass`, `deviceSubclass`, `deviceProtocol`

**`flashRead(addr, size)`**
- Convenience method for single read operation
- Returns: `Promise<Uint8Array>`

**`flashWrite(addr, buf)`**
- Convenience method for single write operation
- Returns: `Promise<void>`

**`flashErase(addr, size)`**
- Convenience method for single erase operation
- Returns: `Promise<void>`

**`flashEraseAndWrite(addr, buf)`**
- Combined erase and write operation
- Returns: `Promise<void>`

**`setTimeouts(timeouts)`**
- Sets the timeouts, in milliseconds:
  - `endpoint`: each bulk transfer. Default 5000.
  - `reset`: an interface reset. Default 1000.
  - `commandStatus`: a command status request. Default 1000.
- A transfer that times out closes the device and throws `UsbError`. `isConnected()` then returns `false` and the next `Picoboot` call reconnects.
- Returns: `void`

### Connection Class

Represents an active connection to a PICOBOOT device.

#### Methods

**`getCommandStatus()`**
- Retrieves the current command status from the device
- Returns: `Promise<PicobootStatusCmd>`

**`resetInterface()`**
- Resets the PICOBOOT USB interface
- Returns: `Promise<void>`

**`sendCmd(cmd, buf?)`**
- Sends a low-level PICOBOOT command
- Returns: `Promise<Uint8Array>`

**`setExclusiveAccess(exclusive)`**
- Sets exclusive access mode (0: not exclusive, 1: exclusive, 2: exclusive and eject)
- Returns: `Promise<void>`

**`reboot(delayMs)`**
- Reboots the device with specified delay
- Returns: `Promise<void>`

**`rebootRp2040(pc, sp, delayMs)`**
- Reboots RP2040 with custom program counter and stack pointer
- Returns: `Promise<void>`

**`rebootRp2350(flags, p0, p1, delayMs)`**
- Reboots RP2350 with custom parameters
- Returns: `Promise<void>`

**`flashEraseStart(size)`**
- Erases flash from start address
- Returns: `Promise<void>`

**`flashErase(addr, size)`**
- Erases flash at specified address (must be sector-aligned)
- Returns: `Promise<void>`

**`flashWriteStart(buf)`**
- Writes buffer to flash start address
- Returns: `Promise<void>`

**`flashWrite(addr, buf)`**
- Writes buffer to flash at specified address (must be page-aligned)
- Returns: `Promise<void>`

**`flashReadStart(size)`**
- Reads from flash start address
- Returns: `Promise<Uint8Array>`

**`flashRead(addr, size)`**
- Reads from flash at specified address
- Returns: `Promise<Uint8Array>`

**`enterXip()`**
- Enters XIP mode (RP2040 only, no-op on RP2350)
- Returns: `Promise<void>`

**`exitXip()`**
- Exits XIP mode (RP2040 only, no-op on RP2350)
- Returns: `Promise<void>`

**`getTarget()`**
- Returns: `Target`

### Target Class

Represents a target device type.

#### Constructor

```javascript
new Target('RP2040')
new Target('RP2350')
new Target('CUSTOM', vid, pid)
```

#### Static Methods

**`Target.fromDevice(device)`**
- Creates a Target from a USBDevice
- Returns: `Target`

#### Instance Methods

**`getVid()`** - Returns: `number`

**`getPid()`** - Returns: `number`

**`flashStart()`** - Returns: `number`

**`flashEnd()`** - Returns: `number|null`

**`flashSectorSize()`** - Returns: `number` (4096 bytes)

**`flashPageSize()`** - Returns: `number` (256 bytes)

**`defaultStackPointer()`** - Returns: `number|null`

**`toString()`** - Returns: `string`

### Error Classes

**`PicobootError`**
- Base error class

**`UsbError`**
- USB communication errors
- Properties: `target`, `originalError`

**`ProtocolError`**
- Protocol-level errors
- Properties: `target`

**`ValidationError`**
- Input validation errors
- Properties: `target`

**`NotFoundError`**
- Device not found errors

## Constants

All memory addresses and USB identifiers are available as exports:

```javascript
import {
    FLASH_START,
    FLASH_END_RP2040,
    FLASH_END_RP2350,
    PAGE_SIZE,
    SECTOR_SIZE,
    PICOBOOT_VID,
    PICOBOOT_PID_RP2040,
    PICOBOOT_PID_RP2350,
} from './constants.js';
```

## Memory Layout

### RP2040
- ROM: `0x00000000` - `0x00004000`
- Flash: `0x10000000` - `0x11000000`
- XIP SRAM: `0x15000000` - `0x15004000`
- SRAM: `0x20000000` - `0x20042000`

### RP2350
- ROM: `0x00000000` - `0x00008000`
- Flash: `0x10000000` - `0x12000000`
- XIP SRAM: `0x13ffc000` - `0x14000000`
- SRAM: `0x20000000` - `0x20082000`

## Common Patterns

### Flash Programming Workflow

```javascript
const picoboot = await Picoboot.requestDevice();
const connection = await picoboot.connect();

await connection.resetInterface();

await connection.setExclusiveAccess(2);

await connection.exitXip();

await connection.flashErase(0x10000000, 4096);

const firmware = new Uint8Array(4096);
await connection.flashWrite(0x10000000, firmware);

await connection.reboot(100);
```

### Reading Flash Contents

```javascript
const picoboot = await Picoboot.requestDevice();
const connection = await picoboot.connect();

await connection.resetInterface();

const data = await connection.flashRead(0x10000000, 256);
console.log(data);

await picoboot.disconnect();
```

## Error Handling

```javascript
try {
    const picoboot = await Picoboot.requestDevice();
    const connection = await picoboot.connect();
    
    await connection.flashWrite(0x10000000, data);
} catch (e) {
    if (e.name === 'NotFoundError') {
        console.log('No device selected');
    } else if (e.name === 'UsbError') {
        console.error('USB error:', e.message);
        console.error('Target:', e.target.toString());
    } else if (e.name === 'ValidationError') {
        console.error('Validation error:', e.message);
    } else {
        console.error('Unexpected error:', e);
    }
}
```

## Development

### Running the Example

Must be served from localhost OR over HTTPS due to WebUSB security requirements.

1. Serve the files over HTTPS (required for WebUSB):
   ```bash
   python3 -m http.server --bind localhost 8000
   ```

2. Set up HTTPS (WebUSB requires secure context):
   - Use a tool like `mkcert` to create local certificates
   - Or use Chrome with `chrome://flags/#unsafely-treat-insecure-origin-as-secure`

3. Open `example.html` in Chrome

### Console Logging

All operations log to the browser console. Open DevTools to see detailed information about:
- Device connection/disconnection
- Command execution
- Data transfers
- Errors

## References

- [RP2040 Datasheet](https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf) - Section 2.8.5
- [RP2350 Datasheet](https://datasheets.raspberrypi.com/rp2350/rp2350-datasheet.pdf) - Section 5.4.8
- [WebUSB API](https://wicg.github.io/webusb/)
