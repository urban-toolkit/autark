import { ViteDevServer, defineConfig } from 'vite';

export function pluginWatchNodeModules(modules: string[]) {
    const pattern = `/node_modules\\/(?!${modules.join('|')}).*/`;
    return {
        name: 'watch-node-modules',
        configureServer: (server: ViteDevServer): void => {

            server.watcher.options = {
                ...server.watcher.options,
                ignored: [new RegExp(pattern), '**/.git/**'],
            };
        },
    };
}

export default defineConfig({
    plugins: [pluginWatchNodeModules(['utkmap', 'utkdb', 'utkplot'])],
    optimizeDeps: {
        exclude: ['utkmap', 'utkdb', 'utkplot'],
    },
    build: {
        rollupOptions: {
            input: {
                nested : '/src/utkdb/',
                nested2: '/src/utkmap/',
                nested3: '/src/utkplot/',
            }
        }
    },
    server: {
        // open: '/src/utkdb/load-csv.html',
        // open: '/src/utkdb/load-geojson.html',
        // open: '/src/utkdb/load-osm-pbf.html',
        // open: '/src/utkdb/spatial-join-near.html',
        // open: '/src/utkdb/spatial-join.html',
        // open: '/src/utkmap/geojson-vis.html',
        // open: '/src/utkmap/layer-opacity.html',
        // open: '/src/utkmap/osm-layers-api.html',
        // open: '/src/utkmap/osm-layers-pbf.html',
        // open: '/src/utkmap/spatial-join-near.html',
        open: '/src/utkmap/spatial-join.html',
        cors: {
            origin: '*',
            allowedHeaders: 'Range, Content-Type, Authorization',
            exposedHeaders: 'Content-Range'
        },
    },
});
