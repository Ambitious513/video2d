const {PNG} = require('pngjs'); const fs=require('fs');
const files = process.argv.slice(2);
for (const f of files){
  const img = PNG.sync.read(fs.readFileSync(f));
  const {width:W,height:H,data:d}=img;
  const set=(x,y,r,g,b,a=255)=>{if(x<0||y<0||x>=W||y>=H)return;const o=(y*W+x)*4;d[o]=r;d[o+1]=g;d[o+2]=b;d[o+3]=a;};
  for(let x=0;x<W;x+=40)for(let y=0;y<H;y++){const major=x%200===0;set(x,y,major?255:120,major?0:180,major?0:255);}
  for(let y=0;y<H;y+=40)for(let x=0;x<W;x++){const major=y%200===0;set(x,y,major?255:120,major?0:180,major?0:255);}
  // labels: draw digits every 200 using tiny 3x5 font
  const F={'0':[7,5,5,5,7],'1':[2,6,2,2,7],'2':[7,1,7,4,7],'3':[7,1,7,1,7],'4':[5,5,7,1,1],'5':[7,4,7,1,7],'6':[7,4,7,5,7],'7':[7,1,1,1,1],'8':[7,5,7,5,7],'9':[7,5,7,1,7]};
  const drawNum=(n,x0,y0,s)=>{const str=String(n);let cx=x0;for(const ch of str){const g=F[ch];for(let r=0;r<5;r++)for(let c=0;c<3;c++)if(g[r]&(4>>c))for(let dy=0;dy<s;dy++)for(let dx=0;dx<s;dx++)set(cx+c*s+dx,y0+r*s+dy,255,0,0);cx+=4*s;}};
  for(let x=200;x<W;x+=200)drawNum(x,x+3,3,3);
  for(let y=200;y<H;y+=200)drawNum(y,3,y+3,3);
  fs.writeFileSync(f.replace('fullres/','grid/'),PNG.sync.write(img));
}
console.log('grids done');
