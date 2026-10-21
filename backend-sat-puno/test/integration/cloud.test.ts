import test from 'node:test';
import assert from 'node:assert/strict';
const root=(process.env.BACKEND_URL??'http://127.0.0.1:3000/api').replace(/\/api$/,'');
test('Servidor único: SPA, archivos, API y secretos', async()=>{
  for(const route of ['/login','/admin/usuarios','/pantalla','/kiosco']){
    const res=await fetch(root+route);assert.equal(res.status,200);
    assert.match(res.headers.get('content-type')??'',/text\/html/);
    assert.match(await res.text(),/id="root"/);
    assert.match(res.headers.get('content-security-policy')??'',/media-src 'self' https:/);
  }
  for(const route of ['/api/no-existe','/.env','/backend-sat-puno/.env','/assets/no-existe.js']){
    const res=await fetch(root+route);assert.equal(res.status,404);
    assert.doesNotMatch(await res.text(),/id="root"/);
  }
  const html=await (await fetch(root+'/login')).text();
  const src=html.match(/src="([^" ]+\.js)"/)?.[1];assert.ok(src);
  const js=await fetch(root+src);assert.equal(js.status,200);
  assert.doesNotMatch(await js.text(),/neondb_owner|npg_|localhost:3000/);
  assert.equal((await fetch(root+'/api/health')).status,200);
});
