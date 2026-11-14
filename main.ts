// news-image-01 entry: the day's front page, "THE WORLD RECORD", Friday 13 November 2026.
//
// The image is drawn once, outside this program, into entry.png beside this file; here it is
// only checked and copied, byte for byte, to <output>/entry.png. Node 22, standard library
// only, no network, no randomness: two runs of this program write identical bytes.
//
// The gate accepts a whole PNG or JPEG, at most 1 MiB, at most 1024x1024. This program checks
// exactly that before copying, so a truncated or edited file fails here rather than at the gate:
//   PNG   signature, chunk walk with every chunk's CRC32, IHDR first, IEND last with nothing
//         after it, and the inflated image data of the size IHDR describes
//   JPEG  segment walk to an SOFn frame header, and EOI as the last two bytes
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const MAX_BYTES = 1048576; // 1 MiB
const MAX_SIDE = 1024;
const SOURCE = new URL('./entry.png', import.meta.url);

function fail(message: string): never {
  console.error('entry.png: ' + message);
  process.exit(1);
}

// ---- PNG -----------------------------------------------------------------------------
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Bytes per pixel for the colour types PNG defines, at the given bit depth. */
function pngPixelBytes(bitDepth: number, colourType: number): number | null {
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const c = channels[colourType];
  if (c === undefined) return null;
  if (colourType === 3) return bitDepth >= 8 ? Math.ceil(bitDepth / 8) : 1; // palette indices
  if (bitDepth < 8) return null; // sub-byte greyscale: accepted, raw size not asserted
  return c * (bitDepth / 8);
}

function checkPng(buf: Buffer): { width: number; height: number } {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) fail('not a PNG (bad signature)');

  let offset = 8;
  let seenIhdr = false;
  let seenIdat = false;
  let width = 0;
  let height = 0;
  let rawExpected = -1;
  const idat: Buffer[] = [];

  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) fail(`chunk ${type} runs past end of file`);
    const stored = buf.readUInt32BE(dataEnd);
    const computed = crc32(buf.subarray(offset + 4, dataEnd));
    if (stored !== computed) fail(`chunk ${type} has a bad checksum`);
    const data = buf.subarray(dataStart, dataEnd);

    if (!/^[A-Za-z]{4}$/.test(type)) fail(`chunk type ${JSON.stringify(type)} is not four letters`);
    if (!seenIhdr && type !== 'IHDR') fail('first chunk is not IHDR');
    if (seenIdat && type !== 'IDAT' && type !== 'IEND') fail(`chunk ${type} breaks the image data`);
    switch (type) {
      case 'IHDR': {
        if (seenIhdr) fail('more than one IHDR');
        if (length !== 13) fail('IHDR is not 13 bytes');
        seenIhdr = true;
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        const bitDepth = data[8];
        const colourType = data[9];
        const interlace = data[12];
        const pixelBytes = pngPixelBytes(bitDepth, colourType);
        if (pixelBytes === null) fail(`unsupported bit depth ${bitDepth} / colour type ${colourType}`);
        if (interlace === 0) {
          // each row is one filter byte plus its pixels
          rawExpected = height * (1 + width * pixelBytes);
        }
        break;
      }
      case 'IDAT':
        seenIdat = true;
        idat.push(data);
        break;
      case 'IEND': {
        if (length !== 0) fail('IEND is not empty');
        if (offset + 12 !== buf.length) fail('bytes follow IEND');
        if (!seenIhdr) fail('IEND before IHDR');
        if (idat.length === 0) fail('no image data');
        if (rawExpected >= 0) {
          let raw: Buffer;
          try {
            raw = inflateSync(Buffer.concat(idat));
          } catch (error) {
            fail('image data does not inflate: ' + (error as Error).message);
          }
          if (raw.length !== rawExpected) {
            fail(`image data is ${raw.length} bytes, header describes ${rawExpected}`);
          }
        }
        return { width, height };
      }
    }
    offset = dataEnd + 4;
  }
  fail('no IEND chunk: the file is truncated');
}

// ---- JPEG ----------------------------------------------------------------------------
function checkJpeg(buf: Buffer): { width: number; height: number } {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) fail('not a JPEG (no SOI)');
  if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) {
    fail('no end-of-image marker: the file is truncated');
  }

  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) fail(`expected a segment marker at byte ${offset}`);
    const marker = buf[offset + 1];
    if (marker === 0xd9) return fail('no frame header before end of image');
    if (marker >= 0xd0 && marker <= 0xd8) {
      offset += 2; // standalone marker, no payload
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) fail(`segment 0x${marker.toString(16)} has an impossible length`);
    if (offset + 2 + length > buf.length) fail(`segment 0x${marker.toString(16)} runs past end of file`);
    // SOF0..SOF15 except DHT (c4), JPG (c8) and DAC (cc) carry the frame dimensions
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (offset + 9 > buf.length) fail('frame header runs past end of file');
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  fail('no frame header found');
}

// ---- CRC32 (PNG's, as in the specification) -------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- the entry ------------------------------------------------------------------------
function main(): void {
  const bytes = readFileSync(SOURCE);
  if (bytes.length === 0) fail('the file is empty');
  if (bytes.length > MAX_BYTES) fail(`${bytes.length} bytes is over the 1 MiB limit`);

  const isPng = bytes.subarray(0, 8).equals(PNG_SIGNATURE);
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpeg) fail('first bytes are neither PNG nor JPEG');

  const { width, height } = isPng ? checkPng(bytes) : checkJpeg(bytes);
  if (width === 0 || height === 0) fail('the image has a zero side');
  if (width > MAX_SIDE || height > MAX_SIDE) {
    fail(`${width}x${height} is larger than ${MAX_SIDE}x${MAX_SIDE}`);
  }

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), bytes);
  console.log(`ok: ${isPng ? 'PNG' : 'JPEG'} ${width}x${height}, ${bytes.length} bytes -> ${join(outDir, 'entry.png')}`);
}

main();
