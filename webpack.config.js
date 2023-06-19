const path = require('path')
/* eslint-disable import/no-extraneous-dependencies */
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const TerserPlugin = require('terser-webpack-plugin');

const tsConfigFile = path.resolve(__dirname, './tsconfig.webpack.json')

/**
 * @type {import('webpack').Configuration}
 */
module.exports = {
  entry: {
    'index': './src/index.ts',
  },
  target: ['web', 'es5'],
  mode: process.env.NODE_ENV || 'production',
  devtool: false,
  output: {
    filename: "[name].js",
    library: {
      name: '__RabbyOpenAPI__',
      type: 'umd',
    },
    path: path.resolve(__dirname, './dist'),
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    plugins: [
      new TsconfigPathsPlugin({
        configFile: tsConfigFile
      })
    ],
  },
  externals: {
    '@debank/common': '@debank/common',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        options: {
          configFile: tsConfigFile
        }
      }
    ],
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        // cache: true,
        // parallel: true,
        // sourceMap: true, // Must be set to true if using source-maps in production
        // minify: TerserPlugin.uglifyJsMinify,
        // https://github.com/webpack-contrib/terser-webpack-plugin#terseroptions
        // `terserOptions` options will be passed to `uglify-js`
        // Link to options - https://github.com/mishoo/UglifyJS#minify-options
        terserOptions: {
          keep_classnames: false,
          keep_fnames: false
        }
      }),
    ]
  }
};
