import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { checkSchema } from '../src/check-schema';
const db=new PrismaClient();
checkSchema(db).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
