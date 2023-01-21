const path = require("path");

module.exports = {
	entry : "./src/mp3worklet/MP3EncoderProcessor.js",
	mode : "production",
	output : {
		path : path.resolve(__dirname, "dist"),
		filename : "mp3worklet.js"
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
