const path = require("path");

module.exports = {
	entry : "./src/mp3worker/mp3worker.js",
	mode : "production",
	output : {
		path : path.resolve(__dirname, "dist"),
		filename : "mp3worker.js"
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
