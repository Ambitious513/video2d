// Posterize-to-palette + vtracer = clean flat 2D vector frames
const {PNG} = require('pngjs');
const vtracer = require('@visioncortex/vtracer');
const fs = require('fs');

const PALETTE = [
  ['bg',      0xFF,0xFF,0xFF],
  ['shadow',  0xDC,0xDB,0xDE],
  ['far',     0x4E,0x55,0x61],
  ['body',    0x68,0x6D,0x75],
  ['scarf',   0xF3,0xE9,0xD3],
  ['scarfSh', 0xE7,0xDE,0xCD],
  ['pack',    0xBF,0xB3,0xA9],
  ['packLt',  0xD9,0xCE,0xC4],
  ['packDk',  0x36,0x37,0x4C],
  ['line',    0x30,0x30,0x3A],
  ['eye',     0x27,0x2A,0x3E],
];
const hex = PALETTE.map(p=>'#'+p.slice(1).map(v=>v.toString(16).padStart(2,'0')).join(''));

function quantize(img){
  const {width:W,height:H,data:d}=img;
  // 3x3 box blur to suppress gradient/AA noise
  const src = Buffer.from(d);
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    for(let c=0;c<3;c++){const s=src[(y*W+x)*4+c]*2+src[((y-1)*W+x)*4+c]+src[((y+1)*W+x)*4+c]+src[(y*W+x-1)*4+c]+src[(y*W+x+1)*4+c];d[(y*W+x)*4+c]=s/6;}
  }
  // nearest palette color
  const idx = new Uint8Array(W*H);
  for(let i=0;i<W*H;i++){
    const r=d[i*4],g=d[i*4+1],b=d[i*4+2];
    let best=0,bd=1e9;
    for(let p=0;p<PALETTE.length;p++){
      const dr=r-PALETTE[p][1],dg=g-PALETTE[p][2],db=b-PALETTE[p][3];
      const dist=dr*dr+dg*dg+db*db;
      if(dist<bd){bd=dist;best=p;}
    }
    idx[i]=best;
  }
  // despeckle: pixel equal to >=3 of 4 neighbors keeps, else adopt majority
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    const i=y*W+x, c=idx[i];
    const n=[idx[i-1],idx[i+1],idx[i-W],idx[i+W]];
    if(n.filter(v=>v===c).length<1){
      const cnt={};n.forEach(v=>cnt[v]=(cnt[v]||0)+1);
      idx[i]=+Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0][0];
    }
  }
  // write flat colors back
  for(let i=0;i<W*H;i++){const p=PALETTE[idx[i]];d[i*4]=p[1];d[i*4+1]=p[2];d[i*4+2]=p[3];d[i*4+3]=255;}
  return img;
}

const [,,inp,out] = process.argv;
const img = quantize(PNG.sync.read(fs.readFileSync(inp)));
const flatPng = PNG.sync.write(img);
fs.writeFileSync(out.replace('.svg','_flat.png'), flatPng);
const svg = vtracer.convertPixels(new Uint8Array(img.data), img.width, img.height, {
  mode:'spline', hierarchical:'stacked', clustering:'color-cluster',
  filterSpeckle:7, colorPrecision:6, cornerThreshold:75, lengthThreshold:5,
  spliceThreshold:45, simplify:2, pathPrecision:2, optimize:2, palette:hex,
});
fs.writeFileSync(out, svg);
console.log(out, (svg.length/1024).toFixed(0)+'KB', 'paths:', (svg.match(/<path/g)||[]).length);
