const path = require("path");

module.exports = {
	entry : "./src/AudioRecorder.js",
	mode : "production",
	output : {
		path : path.resolve(__dirname, "dist"),
		filename : "audiorecorder.js",
		library : {
			name: "AudioRecorder",
			type: "umd",
			export : "default"
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
	}
};
