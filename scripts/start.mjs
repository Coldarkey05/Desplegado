import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('../backend-sat-puno/',import.meta.url));
// No migraciones, seed ni escrituras automáticas al arrancar.
const child=spawn(process.execPath,['dist/src/main.js'],{cwd,env:process.env,stdio:'inherit'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('No se pudo iniciar el backend');process.exitCode=1;});
child.on('exit',(code)=>{process.exitCode=code??1;});
