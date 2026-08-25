// Copyright (C) 2025 Piers Finlayson <piers@piers.rocks>
//
// MIT License

//
// Imports
//

import { Picoboot } from '/pkg/picoboot.js';
import { Connection } from '/pkg/connection.js';
import { Target } from '/pkg/target.js';
import { uf2ToFlashBuffer } from '/js/uf2/uf2.js';
import { PicobootStatusCmd } from '/pkg/commands.js';
import { PICOBOOT_VID } from '/pkg/constants.js';

//
// Type definitions
//

/**
 * @typedef {Object} FirmwareData
 * @property {string} name
 * @property {number} address
 * @property {Uint8Array} data
 * @property {number} origSize
 * @property {string} fileType
 */

/**
 * @typedef {Object} FileData
 * @property {Uint8Array} data
 * @property {string} fileName
 * @property {number} fileSize
 */

//
// Globals
//

// Picoboot and connection
let picoboot = /** @type {Picoboot} */ (null);
let connection = /** @type {Connection} */ (null);
let lastStatus = /** @type {string} */ (null);

// Speeds and timeouts
const FLASH_SPEED = 80 * 1024; // 80KB/s
const READ_SPEED = 360 * 1024; // 400KB/s
const ERASE_SPEED = 100 * 1024; // 200KB/s
const WRITE_SPEED = 240 * 1024; // 400KB/s
const DEFAULT_USB_TIMEOUT = 5000;
const DEFAULT_DISPLAY_UPDATE_PAUSE = 100;
const DEFAULT_REBOOT_DELAY = 100;

// Progress bar
let progressPercent = 0;
const progressFill = /** @type {HTMLElement} */ (document.getElementById('progressFill'));
const progressSection = /** @type {HTMLElement} */ (document.getElementById('progressSection'));

// Hex viewer
const hexViewer = /** @type {HTMLElement} */ (document.getElementById('hexViewer'));
const hexDisplay = /** @type {HTMLElement} */ (document.getElementById('hexDisplay'));
let hexData = null;

// Tabs
const flashTabBtn = /** @type {HTMLButtonElement} */ (document.getElementById('flashTabBtn'));
const advancedTabBtn = /** @type {HTMLButtonElement} */ (document.getElementById('advancedTabBtn'));
const otpTabBtn = /** @type {HTMLButtonElement} */ (document.getElementById('otpTabBtn'));
const flashTab = /** @type {HTMLElement} */ (document.getElementById('flashTab'));
const advancedTab = /** @type {HTMLElement} */ (document.getElementById('advancedTab'));
const otpTab = /** @type {HTMLElement} */ (document.getElementById('otpTab'));
let activeTab = /** @type {HTMLElement} */ (flashTab);

// Devices we look for when the user has not asked for particular USB IDs.
// Raspberry Pi's own IDs, plus One ROM, which runs its own PICOBOOT stack
// under the pid.codes vendor ID.
const ONEROM_VID = 0x1209;
const SITE_TARGETS = [
    new Target('RP2040'),
    new Target('RP2350'),
    new Target('CUSTOM', ONEROM_VID, 0xf540),
    new Target('CUSTOM', ONEROM_VID, 0xf542),
];

const DEVICE_IDS_STORAGE_KEY = 'picoflash.deviceIds';

// Connection bar
const connectBtn = /** @type {HTMLButtonElement} */ (document.getElementById('connectBtn'));
const deviceIdsToggle = /** @type {HTMLButtonElement} */ (document.getElementById('deviceIdsToggle'));
const deviceIds = /** @type {HTMLElement} */ (document.getElementById('deviceIds'));
const customVidInput = /** @type {HTMLInputElement} */ (document.getElementById('customVid'));
const customPidInput = /** @type {HTMLInputElement} */ (document.getElementById('customPid'));

// Flash tab buttons
const flashBtn = /** @type {HTMLButtonElement} */ (document.getElementById('flashBtn'));
const rebootBtn = /** @type {HTMLButtonElement} */ (document.getElementById('rebootBtn'));
let flashOp = /** @type {string} */ null;

// Flash tab firmware file elements
const dropZone = /** @type {HTMLElement} */ (document.getElementById('dropZone'));
const fileInfo = /** @type {HTMLElement} */ (document.getElementById('fileInfo'));
const fileInput = /** @type {HTMLInputElement} */ (document.getElementById('fileInput'));
const fileName = /** @type {HTMLElement} */ (document.getElementById('fileName'));
const fileSize = /** @type {HTMLElement} */ (document.getElementById('fileSize'));
let firmwareData = /** @type {FirmwareData} */ (null);

// Advanced tab buttons
const readFlashBtn = /** @type {HTMLButtonElement} */ (document.getElementById('readFlashBtn'));
const writeFlashBtn = /** @type {HTMLButtonElement} */ (document.getElementById('writeFlashBtn'));
const eraseFlashBtn = /** @type {HTMLButtonElement} */ (document.getElementById('eraseFlashBtn'));
const closeHexViewerBtn = /** @type {HTMLButtonElement} */ (document.getElementById('closeHexViewer'));
const downloadHexDataBtn = /** @type {HTMLButtonElement} */ (document.getElementById('downloadHexDataBtn'));
const exitXipBtn = /** @type {HTMLButtonElement} */ (document.getElementById('exitXipBtn'));
const enterXipBtn = /** @type {HTMLButtonElement} */ (document.getElementById('enterXipBtn'));
const rebootNormalBtn = /** @type {HTMLButtonElement} */ (document.getElementById('rebootNormalBtn'));
const rebootBootselBtn = /** @type {HTMLButtonElement} */ (document.getElementById('rebootBootselBtn'));
const notExclusiveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('notExclusiveBtn'));
const exclusiveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('exclusiveBtn'));
const exclusiveEjectBtn = /** @type {HTMLButtonElement} */ (document.getElementById('exclusiveEjectBtn'));
const advActivityLogToggleBtn = /** @type {HTMLButtonElement} */ (document.getElementById('advActivityToggle'));
const advWriteFileBtn = /** @type {HTMLButtonElement} */ (document.getElementById('advWriteFileBtn'));

// Advanced tab fields
const readAddrInput = /** @type {HTMLInputElement} */ (document.getElementById('readAddr'));
const readLengthInput = /** @type {HTMLInputElement} */ (document.getElementById('readLength'));
const writeAddrInput = /** @type {HTMLInputElement} */ (document.getElementById('writeAddr'));
const writeFileInput = /** @type {HTMLInputElement} */ (document.getElementById('writeFile'));
const eraseAddrInput = /** @type {HTMLInputElement} */ (document.getElementById('eraseAddr'));
const eraseLengthInput = /** @type {HTMLInputElement} */ (document.getElementById('eraseLength'));
const advWriteFileName = /** @type {HTMLElement} */ (document.getElementById('advWriteFileName'));
let advancedOp = /** @type {string} */null;
let advWriteFile = /** @type {FileData} */ (null);

// OTP tab buttons
const readOtpBtn = /** @type {HTMLButtonElement} */ (document.getElementById('readOtpBtn'));
const writeOtpBtn = /** @type {HTMLButtonElement} */ (document.getElementById('writeOtpBtn'));

// OTP tab fields
const oprogReadAddrInput = /** @type {HTMLInputElement} */ (document.getElementById('oprogReadAddr'));
const oprogReadLengthInput = /** @type {HTMLInputElement} */ (document.getElementById('oprogReadLength'));
const oprogWriteAddrInput = /** @type {HTMLInputElement} */ (document.getElementById('oprogWriteAddr'));
const oprogWriteDataInput = /** @type {HTMLInputElement} */ (document.getElementById('oprogWriteData'));
const oprogConfirmInput = /** @type {HTMLInputElement} */ (document.getElementById('oprogConfirm'));
const OTP_CONFIRM_STRING = "Write OTP Row";

//
// Logging and formatting
//

/**
 * Startup code
 * @return {void}
 */
function startup() {
    // Hide logs
    updateActivityLogStatus(false);

    // Restore any USB IDs from the URL or from last time
    loadDeviceIds();
    updateDeviceIdsUi();

    // Log that we're loaded
    logActivity('pico⚡flash loaded', 'info');

    // Update the UI
    updateUi();
}

//
// Device USB IDs
//

/**
 * Turns what the user typed into a USB ID.
 * A leading 0x is allowed but not required - the box has 0x in front of it.
 * @param {string} value
 * @returns {number|null} null if it is not 1 to 4 hex digits
 */
function parseHexId(value) {
    const digits = value.trim().replace(/^0[xX]/, '');
    if (!/^[0-9a-fA-F]{1,4}$/.test(digits)) {
        return null;
    }
    return parseInt(digits, 16);
}

/**
 * @param {string} value
 * @returns {string} the hex digits, without any 0x, ready to put in a box
 */
function normaliseHexId(value) {
    return (value || '').trim().replace(/^0[xX]/, '').toLowerCase();
}

/**
 * Works out what the USB ID boxes currently say.
 * Both empty is fine and means use the site's own list of devices.  One
 * filled in without the other is not, because we cannot search on half an ID.
 * @returns {{valid: boolean, target: Target|null}}
 */
function customTarget() {
    const vidRaw = customVidInput.value.trim();
    const pidRaw = customPidInput.value.trim();

    if (!vidRaw && !pidRaw) {
        return { valid: true, target: null };
    }

    const vid = parseHexId(vidRaw);
    const pid = parseHexId(pidRaw);
    if (vid === null || pid === null) {
        return { valid: false, target: null };
    }

    return { valid: true, target: new Target('CUSTOM', vid, pid) };
}

/**
 * The devices to look for when connecting.  USB IDs typed in by the user
 * replace the site's list rather than adding to it, so that searching for a
 * particular board does not turn up everything else as well.
 * @returns {Array<Target>}
 */
function targets() {
    const custom = customTarget();
    return custom.target ? [custom.target] : SITE_TARGETS;
}

/**
 * Marks up any USB ID box that does not hold usable hex.
 * @return {void}
 */
function updateDeviceIdsUi() {
    const vidRaw = customVidInput.value.trim();
    const pidRaw = customPidInput.value.trim();
    const bothBlank = !vidRaw && !pidRaw;

    customVidInput.classList.toggle('input-error', !bothBlank && parseHexId(vidRaw) === null);
    customPidInput.classList.toggle('input-error', !bothBlank && parseHexId(pidRaw) === null);
}

/**
 * Shows or hides the USB ID boxes.
 * @param {boolean} open
 * @return {void}
 */
function setDeviceIdsOpen(open) {
    deviceIds.classList.toggle('hidden', !open);
    deviceIdsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/**
 * Remembers usable USB IDs for next time, and forgets them once the boxes are
 * emptied.  Half-typed and unusable values are not stored.
 * @return {void}
 */
function saveDeviceIds() {
    const custom = customTarget();

    try {
        if (custom.target) {
            localStorage.setItem(DEVICE_IDS_STORAGE_KEY, JSON.stringify({
                vid: normaliseHexId(customVidInput.value),
                pid: normaliseHexId(customPidInput.value),
            }));
        } else if (custom.valid) {
            localStorage.removeItem(DEVICE_IDS_STORAGE_KEY);
        }
    } catch (e) {
        console.log(`Could not store USB IDs: ${e.message}`);
    }
}

/**
 * Fills the USB ID boxes from the URL, or failing that from last time, and
 * opens them so it is clear the search has been narrowed.
 * @return {void}
 */
function loadDeviceIds() {
    const params = new URLSearchParams(window.location.search);
    let vid = params.get('vid');
    let pid = params.get('pid');

    if (vid === null && pid === null) {
        try {
            const stored = JSON.parse(localStorage.getItem(DEVICE_IDS_STORAGE_KEY));
            if (stored) {
                vid = stored.vid;
                pid = stored.pid;
            }
        } catch (e) {
            console.log(`Could not read stored USB IDs: ${e.message}`);
        }
    }

    if (!vid && !pid) {
        return;
    }

    customVidInput.value = normaliseHexId(vid);
    customPidInput.value = normaliseHexId(pid);
    setDeviceIdsOpen(true);
    saveDeviceIds();
} 

/**
 * Reads a hex number the user typed, with or without a leading 0x.
 *
 * Underscores are allowed as separators, so 0x1000_0000 works as well as
 * 0x10000000.  Anything left over after the digits makes the whole value
 * invalid rather than being quietly dropped.  parseInt on its own reads
 * "1000_0000" as 0x1000, which would read, write or erase at the wrong
 * address without saying so.
 * @param {string} value
 * @returns {number} NaN if the value is not a hex number
 */
function parseHexNumber(value) {
    const digits = value.trim().replace(/^0[xX]/, '').replace(/_/g, '');
    if (!/^[0-9a-fA-F]+$/.test(digits)) {
        return NaN;
    }
    return parseInt(digits, 16);
}

/**
 * Reads a number the user typed - decimal, unless it starts 0x.
 * Underscores are allowed as separators either way, and anything left over
 * makes the value invalid.  See parseHexNumber for why.
 * @param {string} value
 * @returns {number} NaN if the value is not a number
 */
function parseNumber(value) {
    const trimmed = value.trim();
    if (/^0[xX]/.test(trimmed)) {
        return parseHexNumber(trimmed);
    }

    const digits = trimmed.replace(/_/g, '');
    if (!/^[0-9]+$/.test(digits)) {
        return NaN;
    }
    return parseInt(digits, 10);
}

/**
 * Formats a number of bytes into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Logs an activity message, to the activity log, and the console.
 * @param {string} message
 * @param {string} type
 * @return {void}
 */
function logActivity(message, type = 'info') {
    const content = document.getElementById('activityContent');
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${timestamp}] ${message}`;

    if (type === 'error') {
        console.error(entry.textContent);
    } else {
        console.log(entry.textContent);
    }

    content.appendChild(entry);
    content.scrollTop = content.scrollHeight; // Auto-scroll to bottom
}

/**
 * Returns whether the device is connected.
 * @returns {boolean}
 */
function connected() {
    return (connection != null && picoboot != null);
}

/**
 * Clears the last status message. This will cause the status display to be
 * hidden if the device is disconnected.
 * @return {void}
 */
function clearLastStatus() {
    lastStatus = null;
}

/**
 * Updates the status display.
 * @param {*} error
 */
function updateStatus(error) {
    lastStatus = error;
    updateStatusDisplay();
}

//
// UI Updates
//

function updateButtons() {
    // Flash tab

    // Connect/Disconnect button
    connectBtn.disabled = !connected() && !customTarget().valid;
    if (connected()) {
        connectBtn.textContent = 'Disconnect';
    } else {
        connectBtn.textContent = 'Connect';
    }

    // Flash tab
    updateFlashBtns();

    // Advanced tab
    updateAdvBtns(null);

    // OTP tab
    updateOtpBtns();
}

/**
 * Updates the Flash button states.
 * @param {string} newOp
 * @return {void}
 */
function updateFlashBtns(newOp = null) {
    if (newOp !== null) {
        if (newOp == 'none') {
            flashOp = null;
        } else {
            flashOp = newOp;
        }
    }

    updateFlashFlashBtn();
    updateFlashRebootBtn();
}

/**
 * Updates the Flash button state.
 * @return {void}
 */
function updateFlashFlashBtn() {
    flashBtn.textContent = 'Flash';
    if (flashOp == null) {
        if (firmwareData) {
            flashBtn.disabled = false;
        } else {
            flashBtn.disabled = true;
        }
    } else {
        flashBtn.disabled = true;
        if (flashOp == 'flash') {
            flashBtn.textContent = 'Flashing...';
        }
    }
}

/**
 * Updates the Reboot button state.
 * @return {void}
 */
function updateFlashRebootBtn() {
    rebootBtn.textContent = 'Reboot';
    if (flashOp == null) {
        rebootBtn.disabled = false;
    } else {
        rebootBtn.disabled = true;
        if (flashOp == 'reboot') {
            rebootBtn.textContent = 'Rebooting...';
        }
    }
}

/**
 * Shows/hides different advanced tab notes based on target
 */
function updateAdvTab() {
    const rp2040Notes = /** @type {HTMLElement} */ (document.getElementById('rp2040-notes'));
    const rp2350Notes = /** @type {HTMLElement} */ (document.getElementById('rp2350-notes'));
    const customNotes = /** @type {HTMLElement} */ (document.getElementById('custom-notes'));

    rp2040Notes.classList.add('hidden');
    rp2350Notes.classList.add('hidden');
    customNotes.classList.add('hidden');

    if (connected()) {
        if (picoboot.getTarget().type === 'RP2350') {
            rp2350Notes.classList.remove('hidden');
        } else if (picoboot.getTarget().type === 'RP2040') {
            rp2040Notes.classList.remove('hidden');
        } else {
            console.log('Target is custom type:', picoboot.getTarget().type);
            customNotes.classList.remove('hidden');
        }
    } else {
        customNotes.classList.remove('hidden');
    }
}

/**
 * Updates the Advanced tab buttons.
 * @param {string} newOp
 * @return {void}
 */
function updateAdvBtns(newOp = null) {
    if (newOp !== null) {
        if (newOp == 'none') {
            advancedOp = null;
        } else {
            advancedOp = newOp;
        }
    }
    updateAdvReadBtn();
    updateAdvWriteBtn();
    updateAdvEraseBtn();
    updateExitXipBtn();
    updateEnterXipBtn();
    updateRebootNormalBtn();
    updateRebootBootselBtn();
    updateNotExclusiveBtn();
    updateExclusiveBtn();
    updateExclusiveEjectBtn();
}

/**
 * Updates the Enter XIP button state.
 * @return {void}
 */
function updateExitXipBtn() {
    if (advancedOp == null) {
        exitXipBtn.disabled = false;
    } else {
        exitXipBtn.disabled = true;
    }
}

/**
 * Updates the Enter XIP button state.
 * @return {void}
 */
function updateEnterXipBtn() {
    if (advancedOp == null) {
        enterXipBtn.disabled = false;
    } else {
        enterXipBtn.disabled = true;
    }
}

/**
 * Updates the Reboot Normal button state.
 * @return {void}
 */
function updateRebootNormalBtn() {
    if (advancedOp == null) {
        rebootNormalBtn.disabled = false;
    } else {
        rebootNormalBtn.disabled = true;
    }
}

/**
 * Updates the Reboot Bootsel button state.
 * @return {void}
 */
function updateRebootBootselBtn() {
    if (advancedOp == null) {
        rebootBootselBtn.disabled = true;
        if (connected()) {
            if (picoboot.getTarget().type === 'RP2350') {
                // Only supported on RP2350
                rebootBootselBtn.disabled = false;
            }
        }
    } else {
        rebootBootselBtn.disabled = true;
    }
}

/**
 * Updates the Not Exclusive button state.
 * @return {void}
 */
function updateNotExclusiveBtn() {
    if (advancedOp == null) {
        notExclusiveBtn.disabled = false;
    } else {
        notExclusiveBtn.disabled = true;
    }
}

/**
 * Updates the Exclusive button state.
 * @return {void}
 */
function updateExclusiveBtn() {
    if (advancedOp == null) {
        exclusiveBtn.disabled = false;
    } else {
        exclusiveBtn.disabled = true;
    }
}

/**
 * Updates the Exclusive Eject button state.
 * @return {void}
 */
function updateExclusiveEjectBtn() {
    if (advancedOp == null) {
        exclusiveEjectBtn.disabled = false;
    } else {
        exclusiveEjectBtn.disabled = true;
    }
}

/**
 * Updates the Read button state.
 * @return {void}
 */
function updateAdvReadBtn() {
    readFlashBtn.textContent = 'Read';
    if (advancedOp == null) {
        readFlashBtn.disabled = !readAddrInput.value || !readLengthInput.value;
    } else {
        readFlashBtn.disabled = true;
        if (advancedOp == 'read') {
            readFlashBtn.textContent = 'Reading...';
        }
    }
}

/**
 * Updates the Write button state.
 * @return {void}
 */
function updateAdvWriteBtn() {
    writeFlashBtn.textContent = 'Write';
    if (advancedOp == null) {
        writeFlashBtn.disabled = !writeAddrInput.value || !writeFileInput.value;
    } else {
        writeFlashBtn.disabled = true;
        if (advancedOp == 'write') {
            writeFlashBtn.textContent = 'Writing...';
        }
    }
}

/**
 * Updates the Erase button state.
 * @return {void}
 */
function updateAdvEraseBtn() {
    eraseFlashBtn.textContent = 'Erase';
    if (advancedOp == null) {
        eraseFlashBtn.disabled = !eraseAddrInput.value || !eraseLengthInput.value;
    } else {
        eraseFlashBtn.disabled = true;
        if (advancedOp == 'erase') {
            eraseFlashBtn.textContent = 'Erasing...';
        }
    }
}

/**
 * Updates the OTP tab buttons.
 * @return {void}
 */
function updateOtpBtns() {
    updateReadOtpBtn();
    updateWriteOtpBtn();
}

/**
 * Updates the Read OTP button state.
 * @return {void}
 */
function updateReadOtpBtn() {
    readOtpBtn.disabled = true;
    if (connected()) {
        if (picoboot.getTarget().type === 'RP2350') {
            readOtpBtn.disabled = !oprogReadAddrInput.value || !oprogReadLengthInput.value;
        }
    }
}

/**
 * Updates the Write OTP button state.
 * @return {void}
 */
function updateWriteOtpBtn() {
    writeOtpBtn.disabled = true;
    if (connected()) {
        if (picoboot.getTarget().type === 'RP2350') {
            writeOtpBtn.disabled = (oprogConfirmInput.value !== OTP_CONFIRM_STRING) || !oprogWriteAddrInput.value || !oprogWriteDataInput.value;
        }
    }
}

/**
 * Builds what the Device field says.
 *
 * A board with its own USB IDs is named by its USB product name, with the
 * chip after it once we have worked out what the chip is - "One ROM
 * (RP2350)".  Raspberry Pi's own boards are named by the chip alone, because
 * they report a product name of "RP2 Boot", which tells a Pico owner nothing.
 * With neither a product name nor a known chip, fall back to the USB IDs.
 * @returns {string}
 */
function deviceLabel() {
    const info = picoboot.getUsbDeviceInfo();
    const target = picoboot.getTarget();
    const chip = target.type === 'CUSTOM' ? null : target.type;
    const name = info.vendorId === PICOBOOT_VID ? null : info.productName;

    if (name && chip) {
        return `${name} (${chip})`;
    }
    return name || chip || target.toString();
}

/**
 * Updates the status display.
 * @return {void}
 */
function updateStatusDisplay() {
    const deviceModel = document.getElementById('deviceModel');
    const deviceState = document.getElementById('deviceState');
    const deviceSerial = document.getElementById('deviceSerial');
    const deviceStatusView = document.getElementById('deviceStatus');

    // Calculate strings to display
    let statusString = 'Disconnected';
    if (lastStatus) {
        statusString = lastStatus;
    } else if (connected()) {
        statusString = 'Connected';
    }

    let modelString = "-";
    let serialString = "-";
    if (connected()) {
        modelString = deviceLabel();
        serialString = picoboot.getUsbDeviceInfo().serialNumber || "-";
    }

    // Update them
    deviceModel.textContent = modelString;
    deviceSerial.textContent = serialString;
    deviceState.textContent = statusString;

    // Show/hide status view
    deviceStatusView.classList.add('hidden');
    if (lastStatus != null || connected()) {
        deviceStatusView.classList.remove('hidden');
    }
}

/**
 * Updates the file elements display.
 * @param {FirmwareData} firmwareData - The firmware data object.
 * @return {void}
 */
function updateFileElements(firmwareData) {
    if (firmwareData) {
        fileName.textContent = firmwareData.name || 'Loaded Firmware';
        const fileType = firmwareData.fileType || 'bin';
        if (fileType === 'uf2') {
            fileSize.textContent = `${formatBytes(firmwareData.origSize)} (UF2) → ${formatBytes(firmwareData.data.length)} (flash)`;
        } else {
            fileSize.textContent = formatBytes(firmwareData.data.length);
        }
        fileInfo.classList.remove('hidden');
    } else {
        fileInfo.classList.add('hidden');
    }
}

/**
 * Updates the progress bar display.
 * @param {boolean} error
 * @return {void} 
 */
function updateProgress(error = false) {
    if (!connected()) {
        progressPercent = 0;
    }

    progressFill.style.width = `${progressPercent}%`;

    if (error) {
        progressFill.style.backgroundColor = 'var(--color-danger)';
    } else {
        progressFill.style.backgroundColor = 'var(--color-accent)';
    }
}

/**
 * Wraps a promise with a timeout.
 * @param {(...args: any[]) => Promise<any>} promiseFn
 * @param {number} timeoutMs
 * @param {string} operation
 * @returns {Promise<any>}
 */
async function withTimeout(promiseFn, timeoutMs, operation) {
    // Round timeout to nearest 100ms (0.1s)
    const roundedTimeout = Math.round(timeoutMs / 100) * 100;
    
    return Promise.race([
        promiseFn(),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`${operation} timed out after ${roundedTimeout}ms`)), roundedTimeout)
        )
    ]);
}

/**
 * Wraps a promise with a default timeout.
 * @param {(...args: any[]) => Promise<any>} promiseFn
 * @param {string} operation 
 * @returns {Promise<any>}
 */
async function withDefaultTimeout(promiseFn, operation = 'Operation') {
    return withTimeout(promiseFn, DEFAULT_USB_TIMEOUT, operation);
}

/**
 * Initializes the progress bar and starts an interval to update it.
 * @param {number} length - The total length of the operation.
 * @param {number} bps - The speed of the operation in bytes per second.
 * @returns {number|NodeJS.Timeout} - The ID of the interval.
 */
function setupProgressInterval(length, bps) {
    progressPercent = 1;
    updateProgress();

    // Calculate estimated time based on bps
    const estimatedTimeMs = (length / bps) * 1000;

    // Start a timer to update progress every 100ms
    const startTime = Date.now();
    return setInterval(() => {
        const elapsed = Date.now() - startTime;
        const estimatedProgress = Math.min(95, Math.floor((elapsed / estimatedTimeMs) * 100));
        progressPercent = estimatedProgress;
        updateProgress();
    }, 100);
}

/**
 * Clears the progress interval and sets the final progress percent.
 * @param {number|NodeJS.Timeout} intervalId 
 * @param {number} percent 
 * @param {boolean} error
 * @return {void} 
 */
function clearProgressInterval(intervalId, percent, error = false) {
    clearInterval(intervalId);
    progressPercent = percent;
    updateProgress(error);
}

/**
 * Clears the hex data and display.
 * @return {void}
 */
function clearHexData() {
    hexData = null;
    hexDisplay.textContent = '';
}

/**
 * Updates the visibility of the hex viewer.
 * @param {string|null} title - The title to set for the hex viewer, or null to keep existing.
 * @return {void}
 */
function updateHexViewer(title=null) {
    if (!connected()) {
        hexDisplay.textContent = '';
    }
    if (hexDisplay.textContent.length > 0) {
        hexViewer.classList.remove('hidden');
    } else {
        hexViewer.classList.add('hidden');
    }
    if (title !== null) {
        const hexDisplayTitle = /** @type {HTMLElement} */ (document.getElementById('hex-display-title'));
        hexDisplayTitle.textContent = title;
    }
}

/**
 * Updates the hex display content.
 * @param {Uint8Array} data - The data to display.
 * @param {number} addr - The starting address.
 * @return {void}
 */
function updateHexDisplayContent(data, addr) {
    hexData = { data, addr };

    const bytesPerRow = 16;
    const rows = [];
    
    for (let i = 0; i < data.length; i += bytesPerRow) {
        const rowBytes = data.slice(i, i + bytesPerRow);
        const address = (addr + i).toString(16).padStart(8, '0');
        const hexBytes = Array.from(rowBytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
        const asciiBytes = Array.from(rowBytes)
            .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
            .join('')
            .padEnd(bytesPerRow);  // Add this
        const row = `${address}  ${hexBytes.padEnd(bytesPerRow * 3 - 1)}  |${asciiBytes}|`;
        rows.push(row);
    }

    let totalContent = rows.join('\n');
    hexDisplay.textContent = totalContent;
    updateHexViewer("Read Data");
}

/**
 * Updates the hex display content for OTP rows.
 * @param {Uint8Array} data - The OTP data to display.
 * @param {number} rowIndex - The starting row index.
 * @param {boolean} ecc - True for ECC mode (16-bit/2-byte rows), false for raw mode (32-bit/4-byte rows).
 * @return {void}
 */
function updateHexViewerOtp(data, rowIndex, ecc) {
    const bytesPerRow = ecc ? 2 : 4;
    const hexDigits = ecc ? 4 : 8;
    const binWidth = ecc ? 16 : 32;
    const rows = [];
    
    // Calculate actual column widths
    const hexColWidth = 2 + hexDigits; // "0x" + digits
    const binColWidth = binWidth + Math.floor(binWidth / 4) - 1; // bits + spaces every 4
    
    // Helper to center text in a column
    function centerText(text, width) {
        const padding = width - text.length;
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    }
    
    // Header
    const header = `Row  ${centerText('Data', hexColWidth)}  ${centerText('Binary (MSB→LSB)', binColWidth)}  ASCII`;
    rows.push(header);
    
    for (let i = 0; i < data.length; i += bytesPerRow) {
        const rowBytes = data.slice(i, i + bytesPerRow);
        const currentRow = rowIndex + (i / bytesPerRow);
        const rowLabel = currentRow.toString(16).padStart(3, '0');
        
        // Convert from little endian
        let value = 0;
        for (let j = 0; j < rowBytes.length; j++) {
            value |= (rowBytes[j] << (j * 8));
        }
        
        // Hex representation with 0x prefix
        const hexValue = '0x' + value.toString(16).padStart(hexDigits, '0');
        
        // Binary representation (MSB left, LSB right) with gaps every 4 bits
        const binaryString = value.toString(2).padStart(binWidth, '0');
        const binaryValue = binaryString.match(/.{1,4}/g).join(' ');
        
        // ASCII bytes
        const asciiBytes = Array.from(rowBytes)
            .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
            .join('');
        
        const row = `${rowLabel}  ${hexValue}  ${binaryValue}  ${centerText(asciiBytes, 5)}`;
        rows.push(row);
    }
    
    hexDisplay.textContent = rows.join('\n');
    let title = ecc ? "OTP Data (ECC Mode)" : "OTP Data (Raw Mode)";
    updateHexViewer(title);
}

/**
 * Updates all UI elements.
 * @return {void}
 */
function updateUi() {
    updateFileElements(firmwareData);
    updateStatusDisplay();
    updateButtons();
    updateHexViewer();
    updateProgress();
    updateAdvTab();
}

//
// General utilities
// 

/**
 * Calculates a timeout value based on data length and bytes per second.
 * @param {number} length 
 * @param {number} bps 
 * @returns {number}
 */
function calcTimeout(length, bps) {
    const timeoutMs = 1000 * length / bps;

    const timeoutFixed = timeoutMs + 5000; // Add 5 seconds buffer
    const timeoutVar = timeoutFixed * 1.1; // 10% variance

    const max = Math.max(timeoutFixed, timeoutVar);

    console.log(`Calculated timeout: fixed ${timeoutFixed}ms, var ${timeoutVar}ms, using max ${max}ms`);

    return max;
}

/**
 * Checks if the device is connected and tries to connect if not.
 * @returns {Promise<boolean>} - True if connected, false otherwise.
 */
async function checkAndTryConnect() {
    if (connected()) {
        return true
    }

    await connect();
    updateUi();

    if (connected()) {
        return true
    } else {
        logActivity('Cannot flash without a connected device', 'error');
        updateStatus('No device');
        return false;
    }
}

//
// Tab handlers
//

/**
 * Selects a tab and updates its button
 * @param {HTMLElement} button 
 * @param {HTMLElement} tab 
 */
function tabSelected(button, tab) {
    // Deselect all buttons and tabs
    disableTabButtons();
    disableTabs();

    // Activate selected
    button.classList.add('active');
    tab.classList.add('active');
    activeTab = tab;
}

/**
 * Disables all tab buttons.
 * @return {void}
 */
function disableTabButtons() {
    flashTabBtn.classList.remove('active');
    advancedTabBtn.classList.remove('active');
    otpTabBtn.classList.remove('active');
}

/**
 * Disables all tabs.
 * @return {void}
 */
function disableTabs() {
    flashTab.classList.remove('active');
    advancedTab.classList.remove('active');
    otpTab.classList.remove('active');
}

flashTabBtn.addEventListener('click', () => {
    tabSelected(flashTabBtn, flashTab);
});

advancedTabBtn.addEventListener('click', () => {
    tabSelected(advancedTabBtn, advancedTab);
});

otpTabBtn.addEventListener('click', () => {
    tabSelected(otpTabBtn, otpTab);
});

//
// Button handlers
//

document.getElementById('activityToggle').addEventListener('click', () => {
    updateActivityLogStatus();
});
document.getElementById('advActivityToggle').addEventListener('click', () => {
    updateActivityLogStatus();
});

/**
 * Update activity log status
 * @param {boolean|null} show - Whether to show or hide the log. If null, it toggles.
 * @return {void}
 */
function updateActivityLogStatus(show = null) {
    const log = /** @type {HTMLElement} */ (document.getElementById('activityLog'));
    const btn = /** @type {HTMLButtonElement} */ (document.getElementById('activityToggle'));
    if (show == null) {
        log.classList.toggle('hidden');
        btn.textContent = log.classList.contains('hidden') ? 'Show Logs' : 'Hide Logs';
        advActivityLogToggleBtn.textContent = btn.textContent;
    } else if (show) {
        log.classList.remove('hidden');
        btn.textContent = 'Hide Logs';
        advActivityLogToggleBtn.textContent = 'Hide Logs';
    } else {
        log.classList.add('hidden');
        btn.textContent = 'Show Logs';
        advActivityLogToggleBtn.textContent = 'Show Logs';
    }
}

async function connect() {
    updateStatus("Connecting");

    // Try to get a device - requires the user to select one
    try {
        picoboot = await Picoboot.requestDevice(targets());
        console.log('Device selected:', picoboot.getTarget().toString());
    } catch (error) {
        if (error.message.includes('cancelled')) {
            updateStatus('No device');
            logActivity('Device selection cancelled', 'info');
        } else if (error.message.includes('not supported') && error.message.includes('browser')) {
            updateStatus('Browser not supported');
            logActivity('Error: Browser does not support WebUSB', 'error');
        } else {
            updateStatus('Connect error');
            logActivity(`Error: ${error.message}`, 'error');
        }
        return;
    }

    // Connect to the device
    try {
        const usbInfo = picoboot.getUsbDeviceInfo();
        const target = picoboot.getTarget().toString();
        const vidPid = `${usbInfo.vendorId.toString(16).padStart(4, '0')}:${usbInfo.productId.toString(16).padStart(4, '0')}`;
        const manufacturer = usbInfo.manufacturerName || '-';
        const product = usbInfo.productName || '-';
        const serial = usbInfo.serialNumber || '-';

        logActivity(`Selected: ${target} - ${manufacturer} ${product} ${vidPid} ${serial}`, 'info');

        console.log("Connecting to device...");
        connection = await withDefaultTimeout(
            async () => picoboot.connect(),
            "Connect",
        );
        await withDefaultTimeout(
            async () => picoboot.resetInterface(),
            "Reset Interface",
        );

        updateFirmwareData();

        logActivity('Connected successfully', 'success');
        updateStatus('Connected');
    } catch (e) {
        logActivity(`Error: ${e.message}`, 'error');
        connection = null;
        picoboot = null;
        updateStatus('Connection error');
    }
}

async function disconnectNoThrow() {
    try {
        await disconnect();
        updateStatus('Disconnected');
        logActivity('Disconnected', 'success');
    } catch (error) {
        updateStatus('Disconnect error');
        logActivity(`Error during disconnect: ${error.message}`, 'error');
    }
}

connectBtn.addEventListener('click', async () => {
    if (connection) {
        await disconnectNoThrow();
    } else {
        await connect();
    }

    updateUi();
});

deviceIdsToggle.addEventListener('click', () => {
    setDeviceIdsOpen(deviceIds.classList.contains('hidden'));
});

for (const input of [customVidInput, customPidInput]) {
    input.addEventListener('input', () => {
        saveDeviceIds();
        updateDeviceIdsUi();
        updateButtons();
    });

    input.addEventListener('change', () => {
        if (parseHexId(input.value) !== null) {
            input.value = normaliseHexId(input.value);
        }
    });
}

rebootBtn.addEventListener('click', async () => {
    await rebootNormal();
});

/**
 * Reboots the device into normal (application) mode.
 * Doesn't throw on error.
 * Disconnects from the device after a reboot.
 * @returns {Promise<void>}
 */
async function rebootNormal() {
    updateStatus("Rebooting");
    
    // If not connected, attempt to connect to a device
    if (!(await checkAndTryConnect())) {
        return;
    }

    // Reboot
    let reboot_failed = true;
    try {
        await withDefaultTimeout(
            async () => connection.reboot(DEFAULT_REBOOT_DELAY),
            'Reboot'
        );
        reboot_failed = false;
    } catch (error) {
        logActivity(`Error during reboot: ${error.message}`, 'error');
        updateStatus('Reboot error');
    }

    // Disconnect, whether reboot succeeded or no
    try {
        await withDefaultTimeout(
            async () => picoboot.disconnect(),
            'Disconnect'
        );
    } catch (error) {
        logActivity(`Error during disconnect: ${error.message}`, 'error');
        if (!reboot_failed) {
            updateStatus('Disconnect error');
        }
    }

    connection = null;
    picoboot = null;

    logActivity('Device rebooted', 'success');
    updateStatus('Rebooted (disconnected)');

    updateUi();
}

//
// Firmware file handling
//

// Click to browse
dropZone.addEventListener('click', () => {
    fileInput.click();
});

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});

// Visual feedback for drag
['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.add('drag-over');
    });
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('drag-over');
    });
});

// Handle dropped files
dropZone.addEventListener('drop', async (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        await handleFlashFile(files[0]);
    }
});

// Handle selected files
fileInput.addEventListener('change', async (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    if (target.files.length > 0) {
        await handleFlashFile(target.files[0]);
    }
});

/**
 * Loads a firmware file, turning it into a flashable buffer, stored in
 * firmwareData.
 * @param {File} file 
 * @returns {Promise<void>}
 */
async function handleFlashFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (!['uf2', 'bin'].includes(ext)) {
        logActivity(`File extension ${ext} not supported`, 'error');
        updateStatus('Invalid firmware');
        return;
    }
    
    try {
        const fileData = new Uint8Array(await file.arrayBuffer());
        const origSize = fileData.length;

        console.log(`File ${file.name} loaded, size ${formatBytes(origSize)}`);
        
        if (ext === 'uf2') {
            console.log(`Processing UF2 file ${file.name}...`);
            const { address, data } = uf2ToFlashBuffer(fileData);
            firmwareData = { name: file.name, address, data, origSize, fileType: 'uf2' };

            logActivity(`Loaded UF2: ${firmwareData.name} - flash ${formatBytes(firmwareData.data.length)} at address 0x${firmwareData.address.toString(16)}`, 'success');
        } else {
            console.log(`Loading binary file ${file.name}...`);
            let flash_base;
            if (connected()) {
                flash_base = picoboot.getTarget().flashStart();
            } else {
                flash_base = 0x10000000;
            }
            console.log(`Using flash base address: 0x${flash_base.toString(16)}`);
            firmwareData = { name: file.name, address: flash_base, data: fileData, origSize, fileType: 'bin' };

            logActivity(`Loaded firmware: ${firmwareData.name} (${formatBytes(firmwareData.data.length)})`, 'success');
        }
        updateStatus('Firmware loaded');
    } catch (error) {
        logActivity(`Error processing firmware: ${error.message}`, 'error');
        updateStatus('Invalid firmware');
        firmwareData = null;
    }

    // Update UI elements
    updateUi();
}

/**
 * Updates the firmware data address (address to flash to) if connected and
 * firmware is binary.
 * @returns {void}
 */
function updateFirmwareData() {
    if (connected() && firmwareData && firmwareData.fileType === 'bin') {
        firmwareData.address = picoboot.getTarget().flashStart();
        console.log(`Firmware data address updated to 0x${firmwareData.address.toString(16)}`);
    }
}

flashBtn.addEventListener('click', async () => {
    updateStatus("Flashing");

    // Cannot flash without firmware
    if (firmwareData == null) {
        logActivity('No firmware loaded to flash', 'error');
        updateStatus('No firmware');
        return;
    }

    // If not connected, attempt to connect to a device
    if (!(await checkAndTryConnect())) {
        return;
    }

    // Set up progress bar handling and calculate timeout
    const progressInterval = setupProgressInterval(firmwareData.data.length, FLASH_SPEED);
    const timeoutMs = calcTimeout(firmwareData.data.length, FLASH_SPEED);

    // Disable the flash button to prevent multiple clicks
    updateFlashBtns('flash');

    try {
        logActivity(`Flashing ${firmwareData.name} (${formatBytes(firmwareData.data.length)})...`, 'info');
        await withTimeout(
            async () => picoboot.flashEraseAndWrite(firmwareData.address, firmwareData.data),
            timeoutMs,
            `Flash write`
        );

        clearProgressInterval(progressInterval, 100);
        
        logActivity('Flashing completed successfully', 'success');
        updateStatus('Flash complete');
    } catch (error) {
        clearProgressInterval(progressInterval, 100, true);
        logActivity(`Error during flashing: ${error.message}`, 'error');
        if (await tryRecover()) {
            updateStatus('Flash error');
        } else {
            updateStatus('Flash error (disconnected)');
        }
    }

    updateFlashBtns('none');
});

//
// Advanced tab handlers
//

readAddrInput.addEventListener('input', () => {
    updateAdvReadBtn();
});
readLengthInput.addEventListener('input', () => {
    updateAdvReadBtn();
});
writeAddrInput.addEventListener('input', () => {
    updateAdvWriteBtn();
});
writeFileInput.addEventListener('input', () => {
    updateAdvWriteBtn();
});
eraseAddrInput.addEventListener('input', () => {
    updateAdvEraseBtn();
});
eraseLengthInput.addEventListener('input', () => {
    updateAdvEraseBtn();
});
advWriteFileBtn.addEventListener('click', () => {
    writeFileInput.click();
});

readFlashBtn.addEventListener('click', async () => {
    updateStatus("Reading")
    clearHexData();

    // Address is always hex, with or without a leading 0x
    const addr = parseHexNumber(readAddrInput.value);
    
    // Length is a decimal, unless it starts 0x/0X
    const length = parseNumber(readLengthInput.value);

    if (isNaN(addr)) {
        logActivity(`Invalid address for read: ${readAddrInput.value}`, 'error');
        updateStatus('Invalid address');
        return;
    }

    if (isNaN(length) || length <= 0) {
        logActivity(`Invalid length for read: ${readLengthInput.value}`, 'error');
        updateStatus('Invalid length');
        return;
    }

    // If not connected, attempt to connect to a device
    if (!(await checkAndTryConnect())) {
        return;
    }

    // Set up progress bar handling and calculate timeout
    const progressInterval = setupProgressInterval(length, READ_SPEED);
    const timeoutMs = calcTimeout(length, READ_SPEED);

    // Disable the read button to prevent multiple clicks
    updateAdvBtns('read');

    try {
        // Perform the read
        const data = await withTimeout(
            async () => picoboot.flashRead(addr, length),
            timeoutMs,
            `Read`
        );

        clearProgressInterval(progressInterval, 100);

        logActivity(`Read ${formatBytes(length)} from address 0x${addr.toString(16)}`, 'success');
        updateStatus('Read complete');
        
        // Slight pause to give the progress bar time to reach 100% before
        // displaying the read data
        setTimeout(() => {
            updateHexDisplayContent(data, addr);
        }, DEFAULT_DISPLAY_UPDATE_PAUSE);
    } catch (error) {
        clearProgressInterval(progressInterval, 100, true);
        logActivity(`Error during read: ${error.message}`, 'error');
        if (await tryRecover()) {
            updateStatus('Read error');
        } else {
            updateStatus('Read error (disconnected)');
        }
    }

    updateAdvBtns('none');
});

// Hex viewer close button
closeHexViewerBtn.addEventListener('click', () => {
    clearHexData();
    updateHexViewer();
});

// Hex viewer download button
downloadHexDataBtn.addEventListener('click', () => {
    if (!hexData) {
        logActivity('No hex data to download', 'error');
        updateStatus('No data');
        return;
    }

    // Create a blob to be downloaded
    const data = hexData.data;
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    // Create a URL and click it to download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'picoread.bin';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    
    logActivity(`Downloaded ${formatBytes(data.length)} to picoread.bin`, 'success');
    updateStatus("Downloaded");
});

writeFileInput.addEventListener('change', async (e) => {
    const target = /** @type {HTMLInputElement} */ (e.target);

    if (target.files.length > 0) {
        const file = target.files[0];
        const data = new Uint8Array(await file.arrayBuffer());
        const fileName = file.name;
        const fileSize = data.length;

        advWriteFile = { data, fileName, fileSize };

        advWriteFileName.textContent = `${fileName} (${formatBytes(fileSize)})`;
        console.log(`Advanced write file selected: ${fileName}, size ${formatBytes(fileSize)}`);
        updateAdvWriteBtn();
    } else {
        advWriteFile = null;
        advWriteFileName.textContent = 'No file selected';
        console.log('Advanced write file selection cleared');
        updateAdvWriteBtn();
    }
});

writeFlashBtn.addEventListener('click', async () => {
    updateStatus("Writing")

    // Address is always hex, with or without a leading 0x
    const addr = parseHexNumber(writeAddrInput.value);

    if (advWriteFile == null) {
        logActivity('No file selected for write', 'error');
        updateStatus('No file');
        return;
    }
    if (isNaN(addr)) {
        logActivity(`Invalid address for write: ${writeAddrInput.value}`, 'error');
        updateStatus('Invalid address');
        return;
    }
    if (addr % 256 != 0) {
        logActivity(`Write address must be 256-byte aligned`, 'error');
        updateStatus('Invalid address');
        return;
    }

    // If not connected, attempt to connect to a device
    if (!(await checkAndTryConnect())) {
        return;
    }
    
    // Set up progress bar handling and calculate timeout
    const progressInterval = setupProgressInterval(advWriteFile.fileSize, WRITE_SPEED);
    const timeoutMs = calcTimeout(advWriteFile.fileSize, WRITE_SPEED);

    // Disable the write button to prevent multiple clicks
    updateAdvBtns('write');

    console.log(`Writing file ${advWriteFile.fileName} (${formatBytes(advWriteFile.fileSize)}) to address 0x${addr.toString(16)}`);

    try {
        await withTimeout(
            async () => picoboot.flashWrite(addr, advWriteFile.data),
            timeoutMs,
            `Flash write`
        );

        clearProgressInterval(progressInterval, 100);

        logActivity(`Wrote ${formatBytes(advWriteFile.fileSize)} to address 0x${addr.toString(16)}`, 'success');
        updateStatus('Write complete');
    } catch (error) {
        clearProgressInterval(progressInterval, 100, true);
        logActivity(`Error during write: ${error.message}`, 'error');
        if (await tryRecover()) {
            updateStatus('Write error');
        } else {
            updateStatus('Write error (disconnected)');
        }
    }

    updateAdvBtns('none');
});

eraseFlashBtn.addEventListener('click', async () => {
    updateStatus("Erasing")

    // Address is always hex, with or without a leading 0x
    const addr = parseHexNumber(eraseAddrInput.value);
    
    // Length is a decimal, unless it starts 0x/0X
    const length = parseNumber(eraseLengthInput.value);

    if (isNaN(addr)) {
        logActivity(`Invalid address for erase: ${eraseAddrInput.value}`, 'error');
        updateStatus('Invalid address');
        return;
    }

    if (isNaN(length) || length <= 0) {
        logActivity(`Invalid length for erase: ${eraseLengthInput.value}`, 'error');
        updateStatus('Invalid length');
        return;
    }
    if (length % 4096 !== 0) {
        logActivity(`Erase length must be a multiple of flash sector size (4096 bytes)`, 'error');
        updateStatus('Invalid length');
        return;
    }

    // If not connected, attempt to connect to a device
    if (!(await checkAndTryConnect())) {
        return;
    }

    // Set up progress bar handling and calculate timeout
    const progressInterval = setupProgressInterval(length, ERASE_SPEED);
    const timeoutMs = calcTimeout(length, ERASE_SPEED);

    // Disable the erase button to prevent multiple clicks
    updateAdvBtns('erase');

    try {
        await withTimeout(
            async () => picoboot.flashErase(addr, length),
            timeoutMs,
            `Flash erase`
        );

        clearProgressInterval(progressInterval, 100);

        logActivity(`Erased ${formatBytes(length)} from address 0x${addr.toString(16)}`, 'success');
        updateStatus('Erase complete');
    } catch (error) {
        clearProgressInterval(progressInterval, 100, true);
        logActivity(`Error during erase: ${error.message}`, 'error');
        if (await tryRecover()) {
            updateStatus('Erase error');
        } else {
            updateStatus('Erase error (disconnected)');
        }
    }

    updateAdvBtns('none');
});

exitXipBtn.addEventListener('click', async () => {
    updateStatus("Exiting XIP");
    
    // If not connected, attempt to connect to a device
    if (!(await checkAndTryConnect())) {
        return;
    }

    // Disable the button to prevent multiple clicks
    updateAdvBtns('exit_xip');
    
    try {
        await withDefaultTimeout(
            async () => connection.exitXip(),
            'Exit XIP Mode'
        );

        logActivity('Exited XIP mode successfully', 'success');
        updateStatus('Exited XIP');
    } catch (error) {
        logActivity(`Error during exit XIP: ${error.message}`, 'error');
        if (await tryRecover()) {
            updateStatus('Exit XIP error');
        } else {
            updateStatus('Exit XIP error (disconnected)');
        }
    }

    updateAdvBtns('none');
});

enterXipBtn.addEventListener('click', async () => {
    updateStatus("Entering XIP");
    
    // If not connected, attempt to connect to a device
    if (!(await checkAndTryConnect())) {
        return;
    }
    
    // Disable the button to prevent multiple clicks
    updateAdvBtns('enter_xip');
    
    try {
        await withDefaultTimeout(
            async () => connection.enterXip(),
            'Enter XIP Mode'
        );

        logActivity('Entered XIP mode successfully', 'success');
        updateStatus('Entered XIP');
    } catch (error) {
        logActivity(`Error during enter XIP: ${error.message}`, 'error');
        if (await tryRecover()) {
            updateStatus('Enter XIP error');
        } else {
            updateStatus('Enter XIP error (disconnected)');
        }
    }

    updateAdvBtns('none');
});

rebootNormalBtn.addEventListener('click', async () => {
    await rebootNormal();
});

rebootBootselBtn.addEventListener('click', async () => {
    updateStatus("Rebooting to BOOTSEL");

    // If not connected, attempt to connect to a device
    if (!(await checkAndTryConnect())) {
        return;
    }

    // Reboot to BOOTSEL
    let reboot_failed = true;
    try {
        await withDefaultTimeout(
            async () => connection.rebootBootsel(DEFAULT_REBOOT_DELAY),
            'Reboot to BOOTSEL'
        );
        reboot_failed = false;
    } catch (error) {
        logActivity(`Error during reboot to BOOTSEL: ${error.message}`, 'error');
        updateStatus('Reboot error');
    }

    // Disconnect, whether reboot succeeded or no
    try {
        await withDefaultTimeout(
            async () => picoboot.disconnect(),
            'Disconnect'
        );
    } catch (error) {
        logActivity(`Error during disconnect: ${error.message}`, 'error');
        if (!reboot_failed) {
            updateStatus('Disconnect error');
        }
    }

    connection = null;
    picoboot = null;

    logActivity('Device rebooted to BOOTSEL', 'success');
    updateStatus('Rebooted to BOOTSEL (disconnected)');

    updateUi();
});

notExclusiveBtn.addEventListener('click', async () => {
    await setExclusiveAccess(0);
});

exclusiveBtn.addEventListener('click', async () => {
    await setExclusiveAccess(1);
});

exclusiveEjectBtn.addEventListener('click', async () => {
    await setExclusiveAccess(2);
});

/**
 * Handles the Exclusive Mode button click.
 * @param {number} exclusive - Arg to Connection::setExclusiveAccess
 * @returns {Promise<void>}
 */
async function setExclusiveAccess(exclusive) {
    if (exclusive !== 0 && exclusive !== 1 && exclusive !== 2) {
        logActivity(`Invalid exclusive access value: ${exclusive}`, 'error');
        updateStatus('Internal error');
        return;
    }

    let statusMessage;

    if (exclusive === 0) {
        statusMessage = "Not Exclusive";
    } else if (exclusive === 1) {
        statusMessage = "Exclusive";
    } else {
        statusMessage = "Exclusive + Eject";
    }
    updateStatus(`Setting ${statusMessage}`);

    // If not connected, attempt to connect to a device
    if (!(await checkAndTryConnect())) {
        return;
    }

    try {
        await withDefaultTimeout(
            async () => connection.setExclusiveAccess(exclusive),
            'Set Exclusive Access'
        );

        logActivity(`Set exclusive access to ${exclusive}`, 'success');
        updateStatus(`${statusMessage} set`);
    } catch (error) {
        logActivity(`Error during set exclusive access: ${error.message}`, 'error');
        if (await tryRecover()) {
            updateStatus('Set exclusive error');
        } else {
            updateStatus('Set exclusive error (disconnected)');
        }
    }

    updateUi();
}

//
// Low level PICOBOOT operations
//

/**
 * Attempts to recover the Pico connection after a timeout or other error.
 * First tries a GET_COMMAND_STATUS, then a reset.
 * If both fail, disconnects the device.
 * Logs all actions and errors.
 * Does not throw errors.
 * Returns true if recovery succeeded, false if disconnected.
 * @returns {Promise<boolean>}
 */
async function tryRecover() {
    logActivity('Attempting to recover Pico connection after timeout...', 'info');

    // First try a GET_COMMAND_STATUS
    try {
        let status = await getCommandStatus();
        if (!status.isOk()) {
            logActivity(`Picoboot error: ${status.getStatusName()}`, 'warning');
        } else {
            logActivity(`Picoboot status ${status.getStatusName()}`, 'info');
        }
        // Move onto next step
    } catch (e) {
        logActivity('Querying status failed, trying reset...', 'warning');
        // Move onto next step
    }

    // Try a reset of the connection
    try {
        await reset();
        logActivity('Pico connection recovered successfully after reset', 'success');
        return true;
    } catch (e) {
        logActivity('Pico connection could not be recovered, disconnecting', 'error');
        try {
            await disconnect();
        } catch {
            // Ignore errors during disconnect
        }
        return false;
    }
}

/**
 * Issues a GET_COMMAND_STATUS to the device.
 * Low-level function, so only logs to console.
 * Throws errors.
 * @returns {Promise<PicobootStatusCmd>}
 */
async function getCommandStatus() {
    if (!connected()) {
        console.log('No device connected to get command status');
        throw new Error('No device connected');
    }

    try {
        console.log('Getting command status...');

        const status = await withDefaultTimeout(
            async () => connection.getCommandStatus(),
            'Get Command Status'
        )

        console.log(`Command status: ${status.getStatusName()}`);

        return status;
    } catch (error) {
        console.log('Error getting command status');
        if (error.name === 'StatusError') {
            let statusError;
            try {
                statusError = error.status.getStatusName();
            } catch {
                statusError = 'unknown';
            }
            console.log(`Pico device reported an error status: ${statusError}`);
        } else {
            console.log(`Error during command status check: ${error.message}`);
        }

        // Rethrow the error for further handling
        throw error;
    }
}

/**
 * Issues a reset command to the device.
 * Low-level function, so only logs to console.
 * Throws errors.
 * @returns {Promise<void>}
 */
async function reset() {
    if (!connected()) {
        console.log('No device connected to reset');
        throw new Error('No device connected');
    }

    try {
        // Perform a reset
        console.log('Resetting Pico connection...');
        await withDefaultTimeout(
            async () => picoboot.resetInterface(),
            'Reset Interface'
        )
        console.log('Connection reset successfully');
    } catch (error) {
        console.log(`Error during connection reset: ${error.message}`);
        throw error;
    }
}

/**
 * Issues a disconnect command to the device.
 * Low-level function, so only logs to console.
 * Throws errors.
 * @returns {Promise<void>}
 */
async function disconnect() {
    if (!connected()) {
        connection = null;
        picoboot = null;
        console.log('No device connected to disconnect');
        throw new Error('No device connected');
    }

    try {
        // Force a disconnect
        console.log('Disconnecting from device...');
        await withDefaultTimeout(
            async () => picoboot.disconnect(),
            'Disconnect'
        )
        console.log('Disconnected successfully');
    } catch (error) {
        console.log(`Error during connection reset: ${error.message}`);

        connection = null;
        picoboot = null;

        throw error;
    }

    connection = null;
    picoboot = null;
}

//
// OTP tab handlers
//

oprogReadAddrInput.addEventListener('input', () => {
    updateReadOtpBtn();
});
oprogReadLengthInput.addEventListener('input', () => {
    updateReadOtpBtn();
});
oprogWriteAddrInput.addEventListener('input', () => {
    updateWriteOtpBtn();
});
oprogWriteDataInput.addEventListener('input', () => {
    updateWriteOtpBtn();
});
oprogConfirmInput.addEventListener('input', () => {
    updateWriteOtpBtn();
});

readOtpBtn.addEventListener('click', async () => {
    updateStatus("Reading OTP");
    clearHexData();

    // Get ECC mode
    const oprogReadMode = /** @type {HTMLInputElement} */ (document.querySelector('input[name="readMode"]:checked'));
    const eccMode = oprogReadMode.value === "ecc";

    // Get row as decimal, unless it starts 0x or 0X
    const rowIndex = parseNumber(oprogReadAddrInput.value);

    // Length is a decimal, unless it starts 0x/0X
    const rowCount = parseNumber(oprogReadLengthInput.value);

    if (isNaN(rowIndex) || rowIndex < 0 || rowIndex > 4095) {
        logActivity(`Invalid row index for OTP read: ${oprogReadAddrInput.value}`, 'error');
        updateStatus('Invalid row index');
        return;
    }

    if (isNaN(rowCount) || rowCount <= 0) {
        logActivity(`Invalid length for OTP read: ${oprogReadLengthInput.value}`, 'error');
        updateStatus('Invalid row count');
        return;
    }

    if (rowCount + rowIndex > 4096) {
        logActivity(`OTP read exceeds maximum size`, 'error');
        updateStatus('Invalid row count');
        return;
    }

    // If not connected, attempt to connect to a device
    if (!(await checkAndTryConnect())) {
        return;
    }

    // Set up progress bar handling and calculate timeout
    const bytesPerRow = eccMode ? 2 : 4;
    const progressInterval = setupProgressInterval(rowCount * bytesPerRow, READ_SPEED);
    const timeoutMs = calcTimeout(rowCount * bytesPerRow, READ_SPEED);

    // Disable the read button to prevent multiple
    updateAdvBtns('read_otp');

    try {
        // Perform the read
        const data = await withTimeout(
            async () => connection.otpRead(rowIndex, rowCount, eccMode),
            timeoutMs,
            `OTP Read`
        );

        clearProgressInterval(progressInterval, 100);

        logActivity(`Read ${rowCount} rows starting from OTP row ${rowIndex}`, 'success');
        updateStatus('OTP Read complete');

        // Slight pause to give the progress bar time to reach 100% before
        // displaying the read data
        setTimeout(() => {
            updateHexViewerOtp(data, rowIndex, eccMode);
        }, DEFAULT_DISPLAY_UPDATE_PAUSE);
    } catch (error) {
        clearProgressInterval(progressInterval, 100, true);
        logActivity(`Error during OTP read: ${error.message}`, 'error');
        if (await tryRecover()) {
            updateStatus('OTP Read error');
        } else {
            updateStatus('OTP Read error (disconnected)');
        }
    }

    updateAdvBtns('none');
});

writeOtpBtn.addEventListener('click', async () => {
    updateStatus("Writing OTP");

    // Check confirmation
    const confirmStr = oprogConfirmInput.value;
    if (confirmStr !== OTP_CONFIRM_STRING) {
        logActivity(`OTP write not confirmed by user`, 'error');
        updateStatus('Write not confirmed');
        return;
    }

    // Get ECC mode
    const oprogWriteMode = /** @type {HTMLInputElement} */ (document.querySelector('input[name="writeMode"]:checked'));
    const eccMode = oprogWriteMode.value === "ecc";

    // Get row as decimal, unless it starts 0x or 0X
    const rowIndexStr = oprogWriteAddrInput.value;
    let rowIndex;
    if (rowIndexStr.startsWith('0x') || rowIndexStr.startsWith('0X')) {
        rowIndex = parseHexNumber(rowIndexStr);
    } else {
        logActivity(`Invalid row index for OTP write: ${oprogWriteAddrInput.value} - must be hex prefixed with '0x'`, 'error');
        updateStatus('Invalid row index');
        return;
    }

    // Check row is valid
    if (isNaN(rowIndex) || rowIndex < 0 || rowIndex > 4095) {
        logActivity(`Invalid row index for OTP write: ${oprogWriteAddrInput.value}`, 'error');
        updateStatus('Invalid row index');
        return;
    }

    // Data is hex numnber (16 bit or 32 bit) and may start 0x or 0X
    const dataStr = oprogWriteDataInput.value;
    let dataHexStr;
    if (dataStr.startsWith('0x') || dataStr.startsWith('0X')) {
        dataHexStr = dataStr.replace(/^0x/i, '').replace(/_/g, '');
    } else {
        logActivity(`Invalid data for OTP write: ${oprogWriteDataInput.value} - must be hex prefixed with '0x'`, 'error');
        updateStatus('Invalid data');
        return;
    }
    const dataValue = parseHexNumber(dataHexStr);

    let maxDataValue;
    if (eccMode) {
        maxDataValue = 0xFFFF; // 16 bits
    } else {
        maxDataValue = 0xFFFFFFFF; // 32 bits
    }

    // Check dataValue is a number
    if (isNaN(dataValue) || dataValue < 0 || dataValue > maxDataValue) {
        logActivity(`Invalid data for OTP write: ${oprogWriteDataInput.value}`, 'error');
        updateStatus('Invalid data');
        return;
    }

    // Now turn the data Value into a data array - little endian
    let dataArray;
    if (eccMode) {
        dataArray = new Uint8Array(2);
        dataArray[0] = dataValue & 0xFF;
        dataArray[1] = (dataValue >> 8) & 0xFF;
    } else {
        dataArray = new Uint8Array(4);
        dataArray[0] = dataValue & 0xFF;
        dataArray[1] = (dataValue >> 8) & 0xFF;
        dataArray[2] = (dataValue >> 16) & 0xFF;
        dataArray[3] = (dataValue >> 24) & 0xFF;
    }

    // If not connected, attempt to connect to a device
    if (!(await checkAndTryConnect())) {
        return;
    }

    // Set up progress bar handling and calculate timeout
    const bytesPerRow = eccMode ? 2 : 4;
    const progressInterval = setupProgressInterval(bytesPerRow, WRITE_SPEED);
    const timeoutMs = calcTimeout(bytesPerRow, WRITE_SPEED);
    
    // Disable the write button to prevent multiple
    updateAdvBtns('write_otp');

    try {
        // Perform the write
        //await withTimeout(
        //    async () => connection.otpWrite(rowIndex, dataArray, eccMode),
        //    timeoutMs,
        //    `OTP Write`
        //);

        clearProgressInterval(progressInterval, 100);

        // Turn data Array into hex bytes for logging
        let dataHexBytes = [];
        for (let i = 0; i < dataArray.length; i++) {
            dataHexBytes.push(`0x${dataArray[i].toString(16).padStart(2, '0')}`);
        }
        logActivity(`Wrote ${dataHexBytes.join(', ')} to OTP row 0x${rowIndex.toString(16).padStart(3, '0')}, mode: ${eccMode ? 'ECC' : 'Raw'}`, 'success');
        updateStatus('OTP Write complete');
    } catch (error) {
        clearProgressInterval(progressInterval, 100, true);
        logActivity(`Error during OTP write: ${error.message}`, 'error');
        if (await tryRecover()) {
            updateStatus('OTP Write error');
        } else {
            updateStatus('OTP Write error (disconnected)');
        }
    }

    updateAdvBtns('none');

});

//
// Startup code
//
startup();
