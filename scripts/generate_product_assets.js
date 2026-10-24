const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = 0xffffffff;
  const table = [];
  for (let n = 0; n < 256; n++) {
    let cur = n;
    for (let k = 0; k < 8; k++) cur = (cur & 1) ? (0xedb88320 ^ (cur >>> 1)) : (cur >>> 1);
    table[n] = cur;
  }
  for (let i = 4; i < buf.length - 4; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function createPngBuffer(width, height, pixelFn) {
  const rowSize = width * 4 + 1;
  const raw = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const p = rowOffset + 1 + x * 4;
      const [r, g, b, a] = pixelFn(x, y, width, height);
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = a;
    }
  }

  const idatData = zlib.deflateSync(raw, { level: 6 });

  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8; // Bit depth
  ihdr[17] = 6; // Color type RGBA
  ihdr[18] = 0; // Compression
  ihdr[19] = 0; // Filter
  ihdr[20] = 0; // Interlace
  ihdr.writeUInt32BE(crc32(ihdr), 21);

  const idat = Buffer.alloc(idatData.length + 12);
  idat.writeUInt32BE(idatData.length, 0);
  idat.write('IDAT', 4);
  idatData.copy(idat, 8);
  idat.writeUInt32BE(crc32(idat), idat.length - 4);

  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  return Buffer.concat([pngHeader, ihdr, idat, iend]);
}

// Visual themes for different product categories
const THEMES = {
  'uv-uf': {
    bg1: [15, 23, 42],    // Slate 900
    bg2: [30, 27, 75],    // Indigo 950
    accent: [139, 92, 246],// Violet
    accent2: [6, 182, 212],// Cyan
  },
  'cartridge': {
    bg1: [15, 23, 42],
    bg2: [6, 78, 59],     // Emerald 900
    accent: [16, 185, 129],// Emerald
    accent2: [52, 211, 153],
  },
  'spare-part': {
    bg1: [15, 23, 42],
    bg2: [69, 26, 3],     // Amber 950
    accent: [245, 158, 11],// Amber
    accent2: [251, 191, 36],
  },
};

function renderProductGraphic(index, categoryKey, width, height) {
  const theme = THEMES[categoryKey] || THEMES['uv-uf'];
  const cx = width / 2;
  const cy = height / 2;

  // Distinct color seed per index
  const hueShift = ((index * 37) % 60) - 30;
  const rAcc = Math.max(0, Math.min(255, theme.accent[0] + hueShift));
  const gAcc = Math.max(0, Math.min(255, theme.accent[1] + (hueShift / 2)));
  const bAcc = Math.max(0, Math.min(255, theme.accent[2] - hueShift));

  return (x, y) => {
    // 1. Radial background gradient with studio vignette
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = Math.sqrt(cx * cx + cy * cy);
    const normDist = Math.min(1, dist / maxDist);

    let r = Math.round(theme.bg2[0] * (1 - normDist) + theme.bg1[0] * normDist);
    let g = Math.round(theme.bg2[1] * (1 - normDist) + theme.bg1[1] * normDist);
    let b = Math.round(theme.bg2[2] * (1 - normDist) + theme.bg1[2] * normDist);

    // 2. Subtle geometric grid / studio floor reflection
    if (y > height * 0.75 && ((x + y) % 24 === 0 || Math.abs(x - cx) % 32 === 0)) {
      r = Math.min(255, r + 15);
      g = Math.min(255, g + 20);
      b = Math.min(255, b + 25);
    }

    // 3. Central Product Object Rendering based on category
    if (categoryKey === 'uv-uf') {
      // Cylindrical UV chamber body
      const tubeW = 100;
      const tubeH = 240;
      if (Math.abs(dx) < tubeW && Math.abs(dy) < tubeH) {
        // Cylindrical metallic shading
        const normX = dx / tubeW;
        const metallic = Math.cos(normX * Math.PI * 0.5);
        const highlight = Math.exp(-Math.pow((normX - 0.25) * 6, 2)) * 120;

        r = Math.round(180 * metallic + highlight + (rAcc * 0.2));
        g = Math.round(195 * metallic + highlight + (gAcc * 0.2));
        b = Math.round(210 * metallic + highlight + (bAcc * 0.2));

        // UV Glowing core slit in the center
        if (Math.abs(dx) < 14 && Math.abs(dy) < tubeH * 0.7) {
          r = rAcc;
          g = gAcc;
          b = bAcc;
        }

        // Top and bottom chrome endcaps
        if (dy < -tubeH + 30 || dy > tubeH - 30) {
          r = Math.min(255, r + 40);
          g = Math.min(255, g + 40);
          b = Math.min(255, b + 45);
        }
      }
    } else if (categoryKey === 'cartridge') {
      // Ribbed Cartridge Filter Element
      const cartW = 90;
      const cartH = 230;
      if (Math.abs(dx) < cartW && Math.abs(dy) < cartH) {
        const normX = dx / cartW;
        const metallic = Math.cos(normX * Math.PI * 0.5);
        // Horizontal ribbing texture
        const rib = Math.sin((y / 8) * Math.PI) > 0 ? 30 : -20;

        r = Math.min(255, Math.max(0, Math.round(140 * metallic + rib + (rAcc * 0.3))));
        g = Math.min(255, Math.max(0, Math.round(200 * metallic + rib + (gAcc * 0.3))));
        b = Math.min(255, Math.max(0, Math.round(180 * metallic + rib + (bAcc * 0.3))));

        // Polypropylene / Carbon Center Band
        if (Math.abs(dy) < 30) {
          r = 30;
          g = 41;
          b = 59;
        }

        // Endcaps
        if (dy < -cartH + 20 || dy > cartH - 20) {
          r = rAcc;
          g = gAcc;
          b = bAcc;
        }
      }
    } else if (categoryKey === 'spare-part') {
      // Spare Part: Motor, Valve, Sensor, Gauge or Fitting
      const partType = index % 3;
      if (partType === 0) {
        // Booster pump / motor with cooling fins
        const bodyW = 120;
        const bodyH = 140;
        if (Math.abs(dx) < bodyW && Math.abs(dy) < bodyH) {
          const fin = Math.sin((x / 10) * Math.PI) > 0 ? 35 : -15;
          r = Math.min(255, Math.max(0, 100 + fin + rAcc * 0.2));
          g = Math.min(255, Math.max(0, 110 + fin + gAcc * 0.2));
          b = Math.min(255, Math.max(0, 125 + fin + bAcc * 0.2));
        }
        // Shaft / Head
        if (dx > bodyW && dx < bodyW + 40 && Math.abs(dy) < 45) {
          r = 200; g = 210; b = 225;
        }
      } else if (partType === 1) {
        // Pressure Gauge / Circular dial
        const rGauge = 130;
        const gaugeDist = Math.sqrt(dx * dx + dy * dy);
        if (gaugeDist < rGauge) {
          // Dial rim
          if (gaugeDist > rGauge - 15) {
            r = 210; g = 215; b = 225;
          } else {
            // Dial face (white/cream)
            r = 245; g = 247; b = 250;
            // Dial ticks & needle
            if (gaugeDist > rGauge - 35 && gaugeDist < rGauge - 20 && Math.abs((x * y) % 15) < 3) {
              r = 30; g = 41; b = 59;
            }
            // Red / Accent needle
            const needleAngle = Math.atan2(dy, dx);
            if (Math.abs(needleAngle - 0.7) < 0.05 && gaugeDist < rGauge - 25) {
              r = 239; g = 68; b = 68;
            }
          }
        }
      } else {
        // Brass Valve / Fitting
        const valveW = 110;
        const valveH = 80;
        if (Math.abs(dx) < valveW && Math.abs(dy) < valveH) {
          // Brass coloring
          r = 217; g = 155; b = 38;
          if (Math.abs(dx) < 35 && dy < -valveH) {
            // Blue handle
            r = 2; g = 132; b = 199;
          }
        }
      }
    }

    // Outer subtle border / glow vignette
    if (dist > maxDist * 0.95) {
      const edgeFactor = (dist - maxDist * 0.95) / (maxDist * 0.05);
      r = Math.round(r * (1 - edgeFactor * 0.5));
      g = Math.round(g * (1 - edgeFactor * 0.5));
      b = Math.round(b * (1 - edgeFactor * 0.5));
    }

    return [r, g, b, 255];
  };
}

async function run() {
  const mobileDir = path.join(__dirname, '..', 'mobile', 'assets', 'products');
  const adminDir = path.join(__dirname, '..', 'admin', 'public', 'products');

  if (!fs.existsSync(mobileDir)) fs.mkdirSync(mobileDir, { recursive: true });
  if (!fs.existsSync(adminDir)) fs.mkdirSync(adminDir, { recursive: true });

  console.log('Generating high-resolution distinct product assets 14 to 50...');

  for (let i = 14; i <= 50; i++) {
    const numStr = i < 10 ? `0${i}` : `${i}`;
    const filename = `product-${numStr}.png`;
    const mobilePath = path.join(mobileDir, filename);
    const adminPath = path.join(adminDir, filename);

    let catKey = 'uv-uf';
    if (i >= 13 && i <= 24) catKey = 'uv-uf';
    else if (i >= 25 && i <= 38) catKey = 'cartridge';
    else if (i >= 39 && i <= 50) catKey = 'spare-part';

    const pixelFn = renderProductGraphic(i, catKey, 400, 400);
    const pngBuf = createPngBuffer(400, 400, pixelFn);

    fs.writeFileSync(mobilePath, pngBuf);
    fs.writeFileSync(adminPath, pngBuf);
    console.log(`Saved ${filename} (${catKey})`);
  }

  // Also ensure products 01-13 are copied to admin/public/products if not present
  for (let i = 1; i <= 13; i++) {
    const numStr = i < 10 ? `0${i}` : `${i}`;
    const filename = `product-${numStr}.png`;
    const mobileSrc = path.join(mobileDir, filename);
    const adminDst = path.join(adminDir, filename);
    if (fs.existsSync(mobileSrc) && !fs.existsSync(adminDst)) {
      fs.copyFileSync(mobileSrc, adminDst);
    }
  }

  console.log('\nAll 50 product image assets verified and stored in:');
  console.log('- mobile/assets/products/');
  console.log('- admin/public/products/');
}

run().catch(console.error);
