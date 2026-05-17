// Copyright (C) 2025 Piers Finlayson <piers@piers.rocks>
//
// MIT License

function decodeUF2Block(buffer) {
    if (buffer.length !== 512) {
        throw new Error('UF2 block must be 512 bytes');
    }
    
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    
    // Check magic numbers
    const magic0 = view.getUint32(0, true);
    const magic1 = view.getUint32(4, true);
    const magicEnd = view.getUint32(508, true);
    
    if (magic0 !== 0x0A324655 || magic1 !== 0x9E5D5157 || magicEnd !== 0x0AB16F30) {
        throw new Error('Invalid UF2 magic numbers');
    }
    
    const payloadSize = view.getUint32(16, true);
    
    return {
        flags: view.getUint32(8, true),
        flashAddress: view.getUint32(12, true),
        payloadSize: payloadSize,
        blockNumber: view.getUint32(20, true),
        totalBlocks: view.getUint32(24, true),
        boardFamily: view.getUint32(28, true),
        payload: new Uint8Array(buffer.buffer, buffer.byteOffset + 32, payloadSize)
    };
}

export function uf2ToFlashBuffer(uf2Data) {
    // First pass - find address range and collect blocks
    let minAddr = Infinity;
    let maxAddr = 0;
    const blocks = [];

    for (let offset = 0; offset < uf2Data.length; offset += 512) {
        const blockData = uf2Data.slice(offset, offset + 512);
        try {
            const block = decodeUF2Block(blockData);
            blocks.push(block);
            minAddr = Math.min(minAddr, block.flashAddress);
            maxAddr = Math.max(maxAddr, block.flashAddress + block.payloadSize);
        } catch (e) {
            console.warn(`Invalid UF2 block at offset ${offset}: ${e.message}`);
            throw new Error('UF2 file is corrupted or invalid');
        }
    }

    // Create buffer filled with 0xFF (erased flash state)
    const size = maxAddr - minAddr;
    const buffer = new Uint8Array(size);
    buffer.fill(0xFF);

    // Second pass - copy data into buffer
    for (const block of blocks) {
        const offset = block.flashAddress - minAddr;
        buffer.set(block.payload, offset);
    }

    console.log(`UF2 converted: Address range 0x${minAddr.toString(16)} - 0x${maxAddr.toString(16)}, Size: ${size} bytes, Blocks: ${blocks.length}`);

    return {
        address: minAddr,
        data: buffer
    };
}

/**
 * Parse a UF2 into the set of contiguous flash regions it specifies.
 *
 * Unlike `uf2ToFlashBuffer` (which fills the entire min-to-max-address span
 * with a single contiguous buffer, padding gaps with 0xFF), this function
 * returns each contiguous run of UF2 blocks as its own region. This matters
 * for UF2 files that contain blocks at scattered addresses — for example,
 * RP2350 firmware that includes an absolute partition table block at
 * `0x10ffff00` alongside the main firmware at `0x10000000`. Treating that as
 * one buffer produces a 16 MB mostly-empty payload that breaks the
 * bootloader's bulk-write capacity; treating it as two regions writes
 * ~720 KiB + 4 KiB independently and succeeds.
 *
 * Each returned region's start address is rounded DOWN to the nearest
 * `sectorSize` boundary and the data is pre-padded with 0xFF so the result
 * is suitable for passing directly to `Picoboot.flashEraseAndWrite(addr,
 * data)`, which requires sector-aligned addresses.
 *
 * @param {Uint8Array} uf2Data
 * @param {number} [sectorSize=0x1000] flash sector size (4 KiB for RP2040 / RP2350)
 * @returns {Array<{address: number, data: Uint8Array}>}
 */
export function uf2ToFlashRegions(uf2Data, sectorSize = 0x1000) {
    if (uf2Data.length === 0 || uf2Data.length % 512 !== 0) {
        throw new Error(`UF2 size ${uf2Data.length} is not a multiple of 512 bytes`);
    }

    const blocks = [];
    for (let offset = 0; offset < uf2Data.length; offset += 512) {
        const blockData = uf2Data.slice(offset, offset + 512);
        try {
            const block = decodeUF2Block(blockData);
            blocks.push({ address: block.flashAddress, payload: block.payload });
        } catch (e) {
            console.warn(`Invalid UF2 block at offset ${offset}: ${e.message}`);
            throw new Error('UF2 file is corrupted or invalid');
        }
    }

    blocks.sort((a, b) => a.address - b.address);

    // Walk sorted blocks, grouping contiguous runs into regions.
    const plans = [];
    let cur = null;
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (cur && b.address === cur.end) {
            cur.end += b.payload.length;
            cur.idxs.push(i);
        } else {
            if (cur) plans.push(cur);
            cur = { start: b.address, end: b.address + b.payload.length, idxs: [i] };
        }
    }
    if (cur) plans.push(cur);

    const regions = plans.map(({ start, end, idxs }) => {
        const data = new Uint8Array(end - start);
        for (const idx of idxs) {
            const block = blocks[idx];
            data.set(block.payload, block.address - start);
        }
        return alignRegionToSector({ address: start, data }, sectorSize);
    });

    console.log(`UF2 converted: ${regions.length} region(s), ${blocks.length} blocks total`);
    for (const r of regions) {
        console.log(`  region @ 0x${r.address.toString(16)}: ${r.data.length} bytes`);
    }

    return regions;
}

/**
 * Align a region so picoboot.flashEraseAndWrite accepts it: round the start
 * address down to the nearest sector boundary, pre-pad with 0xFF up to the
 * original payload offset, and post-pad to fill the final sector.
 *
 * @param {{address: number, data: Uint8Array}} region
 * @param {number} sectorSize
 * @returns {{address: number, data: Uint8Array}}
 */
function alignRegionToSector({ address, data }, sectorSize) {
    const alignedStart = address & ~(sectorSize - 1);
    const startPad = address - alignedStart;
    const totalLen = startPad + data.byteLength;
    const alignedTotal = Math.ceil(totalLen / sectorSize) * sectorSize;

    if (startPad === 0 && data.byteLength === alignedTotal) {
        return { address, data };
    }
    const padded = new Uint8Array(alignedTotal);
    padded.fill(0xff);
    padded.set(data, startPad);
    return { address: alignedStart, data: padded };
}