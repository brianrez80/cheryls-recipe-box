const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const name=pathname==='/'?'index.html':pathname.slice(1);
 if(name.includes('/')||!types[path.extname(name)]||!fs.existsSync(path.join(root,name))) { res.writeHead(404).end();return; }
 res.writeHead(200,{'Content-Type':types[path.extname(name)],'Cache-Control':'no-store'});
 fs.createReadStream(path.join(root,name)).pipe(res);
}).listen(4178,'127.0.0.1');
