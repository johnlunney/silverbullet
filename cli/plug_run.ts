import { DiskSpacePrimitives } from "../common/spaces/disk_space_primitives.ts";
import { AssetBundle } from "../plugos/asset_bundle/bundle.ts";

import { Application } from "../server/deps.ts";
import { sleep } from "$sb/lib/async.ts";
import { ServerSystem } from "../server/server_system.ts";
import { AssetBundlePlugSpacePrimitives } from "../common/spaces/asset_bundle_space_primitives.ts";

export async function runPlug(
  spacePath: string,
  dbPath: string,
  functionName: string | undefined,
  args: string[] = [],
  builtinAssetBundle: AssetBundle,
  httpServerPort = 3123,
  httpHostname = "127.0.0.1",
) {
  const serverController = new AbortController();
  const app = new Application();

  const serverSystem = new ServerSystem(
    new AssetBundlePlugSpacePrimitives(
      new DiskSpacePrimitives(spacePath),
      builtinAssetBundle,
    ),
    dbPath,
    app,
  );
  await serverSystem.init(true);
  app.listen({
    hostname: httpHostname,
    port: httpServerPort,
    signal: serverController.signal,
  });

  if (functionName) {
    const [plugName, funcName] = functionName.split(".");

    const plug = serverSystem.system.loadedPlugs.get(plugName);
    if (!plug) {
      throw new Error(`Plug ${plugName} not found`);
    }
    const result = await plug.invoke(funcName, args);
    await serverSystem.close();
    serverSystem.denoKv.close();
    serverController.abort();
    return result;
  } else {
    console.log("Running in server mode, use Ctrl-c to stop");
    while (true) {
      await sleep(1000);
    }
  }
}
