import { test, expect } from '@playwright/test';
test('Render: rutas SPA, API y diseño adaptable con un solo origen', async ({ page, request }) => {
  const base=process.env.FRONTEND_URL!;
  const health=await request.get(base+'/api/health'); expect(health.ok()).toBeTruthy();
  const missing=await request.get(base+'/api/no-existe');expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
  const denied=await request.get(base+'/.env');expect(denied.status()).toBe(404);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/login');
  await page.getByLabel('Nombre de usuario',{exact:true}).fill('admin');
  await page.getByLabel('Contraseña',{exact:true}).fill(process.env.TEST_ADMIN_PASSWORD!);
  await page.getByRole('button',{name:'Ingresar al sistema'}).click();
  await page.getByRole('button',{name:'Entrar como Admin',exact:true}).click();
  await expect(page.locator('.page').first()).toBeVisible();
  for(const width of [360,390,768,1024,1440]) {
    await page.setViewportSize({width,height:900});
    for(const route of ['/admin','/admin/usuarios','/admin/roles','/admin/modulos','/admin/servicios','/admin/tipospreferencia','/emitir','/ventanilla','/control-pantalla']) {
      await page.goto(route);
      await expect(page.locator('.page').first()).toBeVisible();
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
    }
    await page.screenshot({path:`test-results/cloud-${width}.png`,fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto('/admin/usuarios');
  await page.getByRole('button',{name:'Nuevo usuario',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await page.screenshot({path:'test-results/cloud-usuario-movil.png',fullPage:true});
  expect(errors).toEqual([]);
});
