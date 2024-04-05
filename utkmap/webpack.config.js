const path = require('path');

module.exports = {
    entry: {
        'utkmap': path.resolve(__dirname, './src/index.ts'),
        'utkmap.min': path.resolve(__dirname, './src/index.ts')
    },
    module: {
        rules: [
            {
                test: /\.glsl$/,
                type: 'asset/source',
                generator: {
                    emit: false,
                },
            },
            {
                test: /\.ts?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            }
        ],
    },
    output: {
        path: path.resolve(__dirname, './dist'),
        filename: 'index.js',
        libraryTarget: 'umd',
    },
    devtool: 'source-map',
};