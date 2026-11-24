// NEON ARENA — сервер без зависимостей. Запуск: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os');
const PORT=+process.env.PORT||3000;
const GAMES=['tap','react','dodge','math','spam','nums','color','stars','coins','timer'],DUR={tap:15,react:30,dodge:30,math:20,spam:10,nums:30,color:20,stars:25,coins:20,timer:30};
let order=[];
const P=new Map();let nid=1,phase='lobby',gi=0,timer;

const srv=http.createServer((q,r)=>{
  fs.readFile(path.join(__dirname,'index.html'),(e,d)=>{
    r.writeHead(e?500:200,{'Content-Type':'text/html; charset=utf-8'});r.end(e?'index.html не найден':d);
  });
});
const frame=s=>{const b=Buffer.from(s),l=b.length;let h;
  if(l<126)h=Buffer.from([0x81,l]);else{h=Buffer.alloc(4);h[0]=0x81;h[1]=126;h.writeUInt16BE(l,2)}
  return Buffer.concat([h,b])};
const send=(p,o)=>{try{p.s.write(frame(JSON.stringify(o)))}catch{}};
const all=(o,ex)=>P.forEach(p=>p.id!==ex&&send(p,o));
const host=()=>P.keys().next().value;
const lobby=()=>all({t:'lobby',phase,host:host(),players:[...P.values()].map(p=>({id:p.id,name:p.name}))});

function start(){
  phase='play';P.forEach(p=>p.score=null);
  all({t:'game',g:order[gi],i:gi,n:order.length,seed:Math.random()*1e9|0,dur:DUR[order[gi]],wait:3500});
  clearTimeout(timer);timer=setTimeout(finish,(DUR[order[gi]]+8)*1000);
}
function finish(){
  if(phase!=='play')return;clearTimeout(timer);phase='result';
  const a=[...P.values()].sort((x,y)=>(y.score??-1)-(x.score??-1));
  a.forEach((p,i)=>{p.gain=(p.score??-1)<0?0:([3,2,1][i]||0);p.total+=p.gain});
  const last=gi==order.length-1,w=[...P.values()].sort((x,y)=>y.total-x.total)[0];
  all({t:'result',final:last,win:w&&w.name,rows:a.map(p=>({id:p.id,name:p.name,score:p.score,gain:p.gain,total:p.total}))});
  timer=setTimeout(()=>{
    if(!P.size)return;
    if(last){gi=0;phase='lobby';P.forEach(p=>p.total=0);lobby()}else{gi++;start()}
  },last?12000:7000);
}

srv.on('upgrade',(q,s)=>{
  const k=q.headers['sec-websocket-key'];if(!k)return s.destroy();
  s.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+
    crypto.createHash('sha1').update(k+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');
  s.setNoDelay(true);
  let p=null,buf=Buffer.alloc(0);
  const h=m=>{
    if(m.t=='hello'&&!p){
      if(P.size>=8)return s.end();
      p={id:nid++,name:String(m.name||'Игрок').replace(/[<>&"'`]/g,'').slice(0,12)||'Игрок',s,total:0,score:phase=='play'?-1:null};
      P.set(p.id,p);send(p,{t:'me',id:p.id});lobby();
    }else if(!p)return;
    else if(m.t=='start'&&phase=='lobby'&&p.id==host()){order=[...GAMES].sort(()=>Math.random()-.5).slice(0,6);gi=0;P.forEach(q=>q.total=0);start()}
    else if(m.t=='prog')all({t:'prog',id:p.id,s:m.s,x:m.x,y:m.y,a:m.a},p.id);
    else if(m.t=='done'&&phase=='play'&&p.score==null){
      p.score=Math.max(0,+m.s||0);
      all({t:'prog',id:p.id,s:p.score,a:false},p.id);
      if([...P.values()].every(q=>q.score!=null))finish();
    }
  };
  s.on('data',d=>{
    buf=Buffer.concat([buf,d]);
    for(;;){
      if(buf.length<2)break;
      const op=buf[0]&15;let len=buf[1]&127,o=2;
      if(len==126){if(buf.length<4)break;len=buf.readUInt16BE(2);o=4}else if(len==127)return s.destroy();
      if(buf.length<o+4+len)break;
      const mk=buf.subarray(o,o+4),pl=Buffer.from(buf.subarray(o+4,o+4+len));
      for(let i=0;i<len;i++)pl[i]^=mk[i&3];
      buf=buf.subarray(o+4+len);
      if(op==8)return s.end();
      if(op==1)try{h(JSON.parse(pl.toString()))}catch{}
    }
  });
  s.on('close',()=>{
    if(!p)return;P.delete(p.id);
    if(!P.size){clearTimeout(timer);phase='lobby';gi=0;return}
    lobby();
    if(phase=='play'&&[...P.values()].every(q=>q.score!=null))finish();
  });
  s.on('error',()=>{});
});

setInterval(()=>P.forEach(p=>{try{p.s.write(Buffer.from([0x89,0]))}catch{}}),25000);
srv.listen(PORT,'0.0.0.0',()=>{
  console.log('\n  NEON ARENA запущена!\n  Ты:      http://localhost:'+PORT);
  for(const l of Object.values(os.networkInterfaces()))for(const i of l)
    if(i.family=='IPv4'&&!i.internal)console.log('  Друзья:  http://'+i.address+':'+PORT);
  console.log('');
});
