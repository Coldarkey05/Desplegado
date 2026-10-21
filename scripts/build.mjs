import { spawnSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
function run(args,folder){const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:root+folder,stdio:'inherit',env:process.env});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
for(const folder of ['backend-sat-puno','frontend-sat-puno'])run(['ci','--include=dev'],folder);
run(['run','prisma:generate'],'backend-sat-puno');
run(['run','build'],'backend-sat-puno');
run(['run','build'],'frontend-sat-puno');
rmSync(root+'backend-sat-puno/public',{recursive:true,force:true});
cpSync(root+'frontend-sat-puno/dist',root+'backend-sat-puno/public',{recursive:true});
