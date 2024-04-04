const path = require('path');

module.exports = {
    entry: {
        utkmap: path.resolve(__dirname, './src/index.ts')
    },
    module: {
        rules: [
            {
                test: /\.ts?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
    },
    devServer: {
        static: {
            directory: path.resolve(__dirname, '../dist')
        },
        port: 4000,
        open: true,
        hot: true,
        compress: true
    },
};