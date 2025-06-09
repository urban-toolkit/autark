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
    server: {
        cors: {
            origin: '*',
            allowedHeaders: 'Range, Content-Type, Authorization',
            exposedHeaders: 'Content-Range'
        },
    },
});
