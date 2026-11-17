const {PNG}=require('pngjs');const fs=require('fs');
const img=PNG.sync.read(fs.readFileSync('fullres/f_001.png'));
const px=(x,y)=>{const o=(y*img.width+x)*4;return [img.data[o],img.data[o+1],img.data[o+2]];};
const pts={head_top:[975,190],head_mid:[960,250],head_low:[990,310],torso:[905,500],near_thigh:[920,650],near_shin:[1000,800],far_thigh:[760,680],far_shin:[640,720],near_arm:[960,470],fist:[1085,445],scarf_mid:[700,330],scarf_low:[600,390],scarf_knot:[950,360],pack_mid:[820,460],pack_pocket:[800,490],pack_dark:[780,555],shadow:[800,972],eye:[1037,262]};
for(const[k,[x,y]]of Object.entries(pts))console.log(k,px(x,y));
// exact top colors
const h={};for(let i=0;i<img.data.length;i+=4){const r=img.data[i],g=img.data[i+1],b=img.data[i+2];if(r>250&&g>250&&b>250)continue;const k=`#${[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')}`;h[k]=(h[k]||0)+1;}
console.log('\nTOP EXACT:');Object.entries(h).sort((a,b)=>b[1]-a[1]).slice(0,24).forEach(([k,v])=>console.log(k,v));
