/**
 * A minimal ZIP writer, store-only (no compression).
 *
 * Written by hand rather than pulled in as a dependency: the two things BookFlow needs a ZIP for —
 * a bundle of CSVs and an .xlsx, which is itself a ZIP — are both small, already-plain-text
 * payloads, and every JS zip library either ships a WASM/native deflate or a large pure-JS one for
 * compression this app has no use for. Nothing here needs Node buffers or a browser API, so it runs
 * unchanged under Hermes.
 */

export type ZipEntry = { name: string; data: Uint8Array };

/** UTF-8 encoder written out so the module never depends on a global `TextEncoder`. */
export function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);

    // Combine a surrogate pair into the single code point it represents.
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = (code - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        index += 1;
      }
    }

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  return new Uint8Array(bytes);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
})();

export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed date and time, the only timestamp the ZIP local header carries. */
function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

class ByteWriter {
  private bytes: number[] = [];

  get length() {
    return this.bytes.length;
  }

  u16(value: number) {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff);
  }

  u32(value: number) {
    this.bytes.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  }

  raw(input: Uint8Array) {
    for (let index = 0; index < input.length; index += 1) {
      this.bytes.push(input[index]);
    }
  }

  toUint8Array() {
    return new Uint8Array(this.bytes);
  }
}

export function createZip(entries: ZipEntry[], modifiedAt = new Date()): Uint8Array {
  const { time, date } = dosDateTime(modifiedAt);
  const writer = new ByteWriter();
  const directory: { nameBytes: Uint8Array; crc: number; size: number; offset: number }[] = [];

  entries.forEach((entry) => {
    const nameBytes = encodeUtf8(entry.name);
    const crc = crc32(entry.data);
    const offset = writer.length;

    writer.u32(0x04034b50);
    writer.u16(20); // version needed
    writer.u16(0x0800); // UTF-8 filenames
    writer.u16(0); // stored, not deflated
    writer.u16(time);
    writer.u16(date);
    writer.u32(crc);
    writer.u32(entry.data.length); // compressed size == uncompressed when stored
    writer.u32(entry.data.length);
    writer.u16(nameBytes.length);
    writer.u16(0); // no extra field
    writer.raw(nameBytes);
    writer.raw(entry.data);

    directory.push({ nameBytes, crc, size: entry.data.length, offset });
  });

  const directoryOffset = writer.length;

  directory.forEach((item) => {
    writer.u32(0x02014b50);
    writer.u16(20); // version made by
    writer.u16(20); // version needed
    writer.u16(0x0800);
    writer.u16(0);
    writer.u16(time);
    writer.u16(date);
    writer.u32(item.crc);
    writer.u32(item.size);
    writer.u32(item.size);
    writer.u16(item.nameBytes.length);
    writer.u16(0); // extra
    writer.u16(0); // comment
    writer.u16(0); // disk number
    writer.u16(0); // internal attributes
    writer.u32(0); // external attributes
    writer.u32(item.offset);
    writer.raw(item.nameBytes);
  });

  const directorySize = writer.length - directoryOffset;

  writer.u32(0x06054b50);
  writer.u16(0);
  writer.u16(0);
  writer.u16(directory.length);
  writer.u16(directory.length);
  writer.u32(directorySize);
  writer.u32(directoryOffset);
  writer.u16(0);

  return writer.toUint8Array();
}

export function zipTextEntry(name: string, text: string): ZipEntry {
  return { name, data: encodeUtf8(text) };
}
