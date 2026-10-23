// @vitest-environment node
import { expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";

const execute = promisify(execFile);

it("bundles the installed Convex app, schemas and every discovered component without deployment or credentials", async () => {
  const require = createRequire(import.meta.url);
  const filename = realpathSync(
    require
      .resolve("convex/package.json")
      .replace(/package\.json$/, "dist/cli.bundle.cjs"),
  );
  const source = readFileSync(filename, "utf8");
  // The published CLI includes its own dependencies, while its individual
  // internal modules are not standalone packages. Expose only the local
  // bundling entrypoints; never run main(), auth setup or a push operation.
  expect(source.split("void main();")).toHaveLength(2);
  const script = `
    const {Module,createRequire}=require('node:module');
    const {readFileSync}=require('node:fs');
    const path=require('node:path');
    const filename=${JSON.stringify(filename)};
    const cliRequire=createRequire(filename);
    const compiled=new Module(filename);
    compiled.filename=filename;
    compiled.paths=cliRequire.resolve.paths('esbuild');
    const source=readFileSync(filename,'utf8');
    if(source.split('void main();').length!==2)throw Error('CLI_ENTRYPOINT_CHANGED');
    compiled._compile(source.replace('void main();',
      'module.exports={nodeFs,componentGraph,bundleDefinitions,bundleImplementations};'),filename);
    const {nodeFs,componentGraph,bundleDefinitions,bundleImplementations}=compiled.exports;
    const ctx={fs:nodeFs,deprecationMessagePrinted:false,
      crash:async ({printedMessage,errorType})=>{throw Error(printedMessage||String(errorType));},
      registerCleanup:()=>'',removeCleanup:()=>null,bigBrainAuth:()=>null};
    (async()=>{
      const root={isRoot:true,path:path.resolve('convex'),
        definitionPath:path.resolve('convex/convex.config.ts'),isRootWithoutConfig:false};
      const graph=await componentGraph(ctx,process.cwd(),root,false,false);
      const components=[...graph.components.values()].filter(c=>c.path!==root.path);
      await bundleDefinitions(ctx,process.cwd(),graph.dependencyGraph,root,[...graph.components.values()],false,false);
      const result=await bundleImplementations({ctx,rootComponentDirectory:root,
        componentDirectories:components,nodeExternalPackages:[],extraConditions:[],verbose:false});
      if(!result.appImplementation.schema||!result.appImplementation.functions.some(f=>f.environment==='node')||
        !result.appImplementation.functions.some(f=>f.environment==='isolate')||
        result.componentImplementations.length!==components.length||components.length<4)
        throw Error('INCOMPLETE_BUNDLE');
      if(result.appImplementation.externalNodeDependencies.length)throw Error('UNEXPECTED_EXTERNALS');
      console.log(JSON.stringify({bundled:true,appModules:result.appImplementation.functions.length,
        components:components.length,componentModules:result.componentImplementations.reduce((n,c)=>n+c.functions.length,0)}));
    })().catch(e=>{console.error(e.stack);process.exitCode=1;});
  `;
  const { stdout } = await execute(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) =>
          /^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|TEMP|TMP|NODE_OPTIONS)$/i.test(
            key,
          ),
        ),
      ),
      DO_NOT_TRACK: "1",
    },
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  }).catch((error) => {
    throw new Error(`${error.message}\n${error.stderr ?? ""}`);
  });
  const result = JSON.parse(stdout.trim());
  expect(result).toMatchObject({ bundled: true });
  expect(result.components).toBeGreaterThanOrEqual(4);
  expect(result.appModules).toBeGreaterThan(0);
  expect(result.componentModules).toBeGreaterThan(0);
}, 30_000);

it("imports the native companion preparation graph and validates the canonical downloader version", async () => {
  const { stdout } = await execute(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {readFileSync} from 'node:fs';
       import {createAcquisitionManifest} from './packages/media/acquisition-runtime.ts';
       import {prepareLocalUrl} from './packages/runner/local-preparation.mjs';
       const release=JSON.parse(readFileSync('./infra/downloader.json','utf8'));
       const schema=createAcquisitionManifest(release.version);
       const manifest={schemaVersion:'1.0.0',status:'failed',title:'Synthetic',description:'',extractor:'fixture',downloaderVersion:release.version};
       if(typeof prepareLocalUrl!=='function'||!schema.safeParse(manifest).success||
         schema.safeParse({...manifest,downloaderVersion:'wrong'}).success)throw Error('MANIFEST_BINDING_INVALID');
       console.log('native-preparation-import-passed');`,
    ],
    { windowsHide: true },
  );
  expect(stdout.trim()).toBe("native-preparation-import-passed");
});
