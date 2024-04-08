const path = require('path');

module.exports = {
    entry: {
        'utkrun': path.resolve(__dirname, './src/index.ts'),
        'utkrun.min': path.resolve(__dirname, './src/index.ts')
    },
    module: {
        rules: [
            {
                test: /\.(vs|fs)/,
                type: 'asset/source',
                generator: {
                    emit: false,
                },
            },
            {
                test: /\.ts?$/,
                use: 'ts-loader',
                include: [ path.resolve(__dirname, './src')],
                exclude: /node_modules/,
            }
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        path: path.resolve(__dirname, './dist'),
        filename: 'index.js',
        libraryTarget: 'umd',
    },
    devtool: 'source-map',
};