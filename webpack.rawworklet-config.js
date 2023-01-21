const path = require("path");

module.exports = {
	entry : "./src/RawPassthroughProcessor.js",
	mode : "production",
	output : {
		path : path.resolve(__dirname, "dist"),
		filename : "rawworklet.js"
	},
	module : {
		rules : [
			{
				test : /\.m?js$/,
				exclude : /(node_modules)/,
				use : {
					loader : "babel-loader",
					options : {
						presets : ["@babel/preset-env"]
					}
				}
			}
		]
	}
};
