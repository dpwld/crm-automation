import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/domain.ts'],outfile:'.sites-runtime/domain-tests.mjs',bundle:true,platform:'node',format:'esm',packages:'external',tsconfig:'tsconfig.json'});
const result=spawnSync(process.execPath,['.sites-runtime/domain-tests.mjs'],{stdio:'inherit'});process.exit(result.status??1);
