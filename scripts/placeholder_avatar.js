// 生成 400x600 渐变占位头像，tavern_sync 打包 PNG 角色卡需要头像存在。
// 用法: node scripts/placeholder_avatar.js <输出路径.png>
const fs = require('fs');
const zlib = require('zlib');

const out = process.argv[2];
if (!out) {
  console.error('用法: node scripts/placeholder_avatar.js <输出路径.png>');
  process.exit(1);
}

const w = 400, h = 600;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = buf => {
  let c = ~0;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return ~c >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0);
ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // RGB

// 自上而下：深蓝紫 → 玫瑰
const raw = Buffer.alloc((w * 3 + 1) * h);
for (let y = 0; y < h; y++) {
  const t = y / (h - 1);
  const row = y * (w * 3 + 1);
  for (let x = 0; x < w; x++) {
    const i = row + 1 + x * 3;
    raw[i] = Math.round(40 + 160 * t);
    raw[i + 1] = Math.round(36 + 60 * t);
    raw[i + 2] = Math.round(90 + 40 * t);
  }
}

fs.writeFileSync(out, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]));
console.log(`已生成占位头像: ${out}`);
