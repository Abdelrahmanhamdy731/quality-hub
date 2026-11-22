import * as esbuild from 'esbuild';
import {mkdir,writeFile,readFile,rm,copyFile} from 'node:fs/promises';
const configPath=process.env.QUALITY_CONFIG_FILE||'quality.config.json';
const cfg=JSON.parse(await readFile(configPath,'utf8'));
await mkdir('docs',{recursive:true});
await rm('docs/assets',{recursive:true,force:true});
await esbuild.build({entryPoints:['src/app.js'],bundle:true,minify:true,splitting:true,format:'esm',outdir:'docs/assets',entryNames:'app-[hash]',chunkNames:'chunk-[hash]',metafile:true,target:['es2022'],write:true}).then(async r=>{
 const app=Object.keys(r.metafile.outputs).find(k=>r.metafile.outputs[k].entryPoint==='src/app.js');
 const css=r.metafile.outputs[app].cssBundle;
 const base=app.replace('docs/',''),style=css.replace('docs/','');
 const csp=`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src ${cfg.url} ${cfg.url.replace('https:','wss:')}; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests`;
 await writeFile('docs/config.js','window.QUALITY_CONFIG='+JSON.stringify(cfg)+';\n');
 await writeFile('docs/index.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="theme-color" content="#f5f6fa"><meta name="description" content="A private project quality workspace. Sign in with an account supplied by your administrator."><title>QualityHub | Project workspace</title><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${style}"><script src="config.js" defer></script><script type="module" src="${base}"></script></head><body><div id="app"><div style="display:grid;place-items:center;height:100vh;color:#8091b0;font-family:system-ui">QualityHub</div></div><noscript>This project workspace needs JavaScript to sign in securely.</noscript></body></html>`);
 await writeFile('docs/.nojekyll','');
 await writeFile('docs/favicon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#6477ca"/><g fill="none" stroke="white" stroke-width="3"><rect x="15" y="15" width="14" height="14" rx="4"/><rect x="35" y="15" width="14" height="14" rx="4"/><rect x="15" y="35" width="14" height="14" rx="4"/><rect x="35" y="35" width="14" height="14" rx="4"/></g></svg>');
 console.log('Built',app,'and',css);
});
