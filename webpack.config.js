const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: {
        'utk-demo': path.resolve(__dirname, './demo/index.ts'),
    },
    module: {
        rules: [
            {
                test: /\.ts?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ],
    },

    resolve: {
        extensions: ['.ts', '.js'],
    },

    plugins: [new HtmlWebpackPlugin(
        {
            title: 'UTK demo app',
            filename: 'index.html',
            template: path.resolve(__dirname, './demo/index.html')
        }
    )],

    devServer: {
        static: {
            directory: path.resolve(__dirname, './demo')
        },

        port: 4000,
        open: true,
        hot: true,
        compress: true,
        historyApiFallback: true
    }
};