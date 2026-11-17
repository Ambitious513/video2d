const {PNG} = require('pngjs'); const fs = require('fs');
const frames = [];
for (let i=1;i<=94;i++){
  const p = `frames/f_${String(i).padStart(3,'0')}.png`;
  frames.push(PNG.sync.read(fs.readFileSync(p)));
}
const W=frames[0].width, H=frames[0].height;
// bbox of character (dark pixels) and shadow (light gray in bottom area)
const stats = frames.map((f,idx)=>{
  let minX=1e9,maxX=-1,minY=1e9,maxY=-1, sx0=1e9,sx1=-1,sy0=1e9,sy1=-1, cx=0,cy=0,n=0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const o=(y*W+x)*4, r=f.data[o],g=f.data[o+1],b=f.data[o+2];
    const lum=(r+g+b)/3;
    if(lum<200){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; cx+=x;cy+=y;n++; }
    else if(lum<246 && y>H*0.8){ if(x<sx0)sx0=x; if(x>sx1)sx1=x; if(y<sy0)sy0=y; if(y>sy1)sy1=y; }
  }
  return {i:idx+1, minX,maxX,minY,maxY, cx:+(cx/n).toFixed(1), cy:+(cy/n).toFixed(1), shadow:[sx0,sx1,sy0,sy1]};
});
console.log("CHAR BBOX + CENTROID (960x540 space):");
stats.forEach(s=>console.log(`f${String(s.i).padStart(2,'0')} x[${s.minX},${s.maxX}] y[${s.minY},${s.maxY}] c(${s.cx},${s.cy}) sh[${s.shadow}]`));
// loop detection: downsample gray 96x54, MAD matrix for shifts
const ds = frames.map(f=>{
  const a=new Float32Array(96*54);
  for(let y=0;y<54;y++)for(let x=0;x<96;x++){
    let s=0; for(let dy=0;dy<10;dy++)for(let dx=0;dx<10;dx++){const o=((y*10+dy)*W+x*10+dx)*4; s+=(f.data[o]+f.data[o+1]+f.data[o+2])/3;}
    a[y*96+x]=s/100;
  } return a;
});
function mad(a,b){let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/a.length;}
console.log("\nLOOP PERIOD (avg MAD for shift p):");
for(let p=4;p<=30;p++){let s=0,c=0;for(let i=0;i+p<94;i++){s+=mad(ds[i],ds[i+p]);c++;}console.log(`p=${p} mad=${(s/c).toFixed(3)}`);}
// palette: quantize colors /8, count
const hist={};
frames.forEach(f=>{for(let i=0;i<f.data.length;i+=16){const r=f.data[i],g=f.data[i+1],b=f.data[i+2];if((r+g+b)/3>250)continue;const k=`${r>>3<<3},${g>>3<<3},${b>>3<<3}`;hist[k]=(hist[k]||0)+1;}});
console.log("\nTOP COLORS (quantized rgb, count):");
Object.entries(hist).sort((a,b)=>b[1]-a[1]).slice(0,18).forEach(([k,v])=>console.log(k,v));
