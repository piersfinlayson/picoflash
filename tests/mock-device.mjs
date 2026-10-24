// Copyright (C) 2026 Piers Finlayson <piers@piers.rocks>
//
// MIT License

// Tests flash command chunking and transfer timeouts against a mock PICOBOOT
// device.
//
// Usage: node tests/mock-device.mjs

import { Picoboot } from '../pkg/picoboot.js';
import { Target } from '../pkg/target.js';
import { UsbError } from '../pkg/errors.js';

// The library logs every transfer
console.log = () => {};
console.error = () => {};

const CMD_ERASE = 0x03, CMD_READ = 0x84, CMD_WRITE = 0x05, CMD_EXIT_XIP = 0x06;

class MockDevice {
    constructor() {
        this.opened = false;
        this.flash = new Map();
        this.cmds = [];
        this.pending = null;      // command awaiting its data phase
        this.hangWriteAt = null;  // address of a write whose data never completes
        this.closes = 0;
        this.opens = 0;
        this.configuration = { interfaces: [{ interfaceNumber: 0 }] };
    }
    async open() { this.opened = true; this.opens++; }
    async close() { this.opened = false; this.closes++; }
    async selectConfiguration() {}
    async claimInterface() {}
    async releaseInterface() {}
    async controlTransferOut() { this.check(); return { status: 'ok' }; }
    async controlTransferIn() { this.check(); return { status: 'ok', data: new DataView(new ArrayBuffer(16)) }; }
    check() { if (!this.opened) throw new Error('device closed'); }
    async transferOut(ep, data) {
        this.check();
        if (this.pending && this.pending.id === CMD_WRITE) {
            const cmd = this.pending;
            this.pending = null;
            if (cmd.addr === this.hangWriteAt) return new Promise(() => {});
            for (let i = 0; i < data.length; i++) this.flash.set(cmd.addr + i, data[i]);
            this.ack = true;
            return { status: 'ok', bytesWritten: data.length };
        }
        if (data.length === 32) {
            const v = new DataView(data.buffer, data.byteOffset, 32);
            const cmd = { id: v.getUint8(8), len: v.getUint32(12, true), addr: v.getUint32(16, true), size: v.getUint32(20, true) };
            this.cmds.push(cmd);
            if (cmd.id === CMD_WRITE || cmd.id === CMD_READ) this.pending = cmd;
            else this.ack = true;
            return { status: 'ok', bytesWritten: 32 };
        }
        return { status: 'ok', bytesWritten: data.length };  // ack after an IN command
    }
    async transferIn(ep, len) {
        this.check();
        if (this.pending && this.pending.id === CMD_READ) {
            const cmd = this.pending;
            this.pending = null;
            const out = new Uint8Array(len);
            for (let i = 0; i < cmd.size; i++) out[i] = (cmd.addr + i) & 0xff;
            return { status: 'ok', data: new DataView(out.buffer) };
        }
        return { status: 'ok', data: new DataView(new ArrayBuffer(len)) };
    }
}

let failures = 0;
const check = (ok, what) => { if (!ok) { failures++; process.stdout.write(`FAIL ${what}\n`); } else process.stdout.write(`ok   ${what}\n`); };

const KB = 1024;
const timeouts = { endpoint: 200, reset: 200, commandStatus: 200 };
const dev = new MockDevice();
const pb = new Picoboot(dev, new Target('RP2350'), 0, 1, 2, 64, timeouts);

// Write a 1.69MB image
const image = new Uint8Array(0x1b0000).map((_, i) => (i * 7) & 0xff);
await pb.flashWrite(0x10000000, image);
const writes = dev.cmds.filter(c => c.id === CMD_WRITE);
check(writes.length === 27, `write split into 27 commands (got ${writes.length})`);
check(writes.every((c, i) => c.addr === 0x10000000 + i * 64 * KB && c.len === Math.min(64 * KB, image.length - i * 64 * KB)), 'write addresses and lengths');
check(image.every((b, i) => dev.flash.get(0x10000000 + i) === b), 'written data matches image');
check(dev.cmds.filter(c => c.id === CMD_EXIT_XIP).length === 1, 'one EXIT_XIP before the write');

// Erase 1.69MB
dev.cmds = [];
await pb.flashErase(0x10000000, 0x1b0000);
const erases = dev.cmds.filter(c => c.id === CMD_ERASE);
check(erases.length === 27 && erases.every((c, i) => c.addr === 0x10000000 + i * 64 * KB && c.size === 64 * KB && c.len === 0), 'erase split into 27 64KB commands');

// Read 200KB
dev.cmds = [];
const data = await pb.flashRead(0x10001000, 200 * KB);
const reads = dev.cmds.filter(c => c.id === CMD_READ);
check(reads.length === 4 && reads[3].size === 200 * KB - 3 * 64 * KB, 'read split into 4 commands');
check(data.length === 200 * KB && data.every((b, i) => b === ((0x10001000 + i) & 0xff)), 'read data assembled in order');

// A write that never completes times out, closes the device and recovers
await pb.connect();
dev.hangWriteAt = 0x10020000;
const start = Date.now();
let err = null;
try { await pb.flashWrite(0x10000000, image); } catch (e) { err = e; }
check(err instanceof UsbError && /timed out after 200ms/.test(err.message), `timeout throws UsbError (${err && err.message})`);
check(Date.now() - start < 2000, 'timeout fires promptly');
check(!dev.opened && dev.closes >= 1, 'device closed on timeout');
check(!pb.isConnected(), 'isConnected() false after timeout');

dev.hangWriteAt = null;
const opensBefore = dev.opens;
await pb.flashWrite(0x10000000, image.subarray(0, 4 * KB));
check(dev.opens === opensBefore + 1, 'next call reopens the device');
await pb.connect();
check(pb.isConnected(), 'connect() after timeout connects again');

process.stdout.write(failures ? `${failures} FAILED\n` : 'all passed\n');
process.exit(failures ? 1 : 0);
