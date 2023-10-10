const path = require("path");

module.exports = {
	entry : "./src/react.js",
	mode : "production",
	output : {
		path : path.resolve(__dirname, "dist"),
		filename : "react.js",
		library : {
			name: "ReactAudioRecorder",
			type: "umd"
		}
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
	},
	externals: [
		"react"
	]
};
