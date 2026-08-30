// Generate PNG icons using pure Node.js (no native deps)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(size, text) {
  const width = size;
  const height = size;
  const buffer = Buffer.alloc(width * height * 4);

  const cx = width / 2;
  const cy = height / 2;
  const r = (width / 2) - 8;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= r) {
        // Dark blue industrial background #0F172A
        buffer[idx] = 15;     // R
        buffer[idx + 1] = 23;  // G
        buffer[idx + 2] = 42;  // B
        buffer[idx + 3] = 255; // A

        // Inner glowing ring
        if (dist >= r - 12 && dist <= r - 4) {
          buffer[idx] = 37;
          buffer[idx + 1] = 99;
          buffer[idx + 2] = 235;
        }

        // Center amber crosshair
        if ((Math.abs(dx) < 6 && Math.abs(dy) < r * 0.45) || (Math.abs(dy) < 6 && Math.abs(dx) < r * 0.45)) {
          buffer[idx] = 217;
          buffer[idx + 1] = 119;
          buffer[idx + 2] = 6;
        }
      } else {
        // Transparent
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
      }
    }
  }

  // Construct uncompressed raw IDAT rows (filter byte 0 + RGBA)
  const rowBytes = width * 4;
  const rawData = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (rowBytes + 1)] = 0; // Filter None
    buffer.copy(rawData, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  const compressedData = zlib.deflateSync(rawData);

  // Build PNG chunks
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 Helper
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    crc32.table = table;
  }

  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

fs.writeFileSync(path.join(__dirname, 'icon-192.png'), createPng(192, 'H2S'));
fs.writeFileSync(path.join(__dirname, 'icon-512.png'), createPng(512, 'H2S'));
console.log('PNG Icons Generated Successfully!');
