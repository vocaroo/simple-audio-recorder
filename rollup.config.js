import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import replace from "@rollup/plugin-replace";
import {babel} from "@rollup/plugin-babel";
import terser from "@rollup/plugin-terser";

const isProd = process.env.NODE_ENV === "production";
const extensions = [".js", ".mjs"];

const minify = terser({
	format : {comments : false},
	compress : {
		passes : 2,
		pure_getters : true,
		unsafe_math : false,
	},
	mangle : {toplevel : true},
});

const basePlugins = [
	resolve({extensions}),
	commonjs(),
	// keep builds SSR-safe and deterministic
	replace({
		preventAssignment : true,
		values : {
			"process.env.NODE_ENV" : JSON.stringify("production"),
		},
	}),
	babel({
		babelHelpers : "bundled",
		presets : [["@babel/preset-env", {targets : ">0.5%, not dead"}]],
		extensions,
		exclude : /node_modules/,
	}),
];

// Core library (AudioRecorder)
const coreInput = "src/AudioRecorder.js";

export default [
	// Core: ESM + CJS for bundlers/SSR
	{
		input : coreInput,
		plugins : basePlugins,
		output : [
			{file : "dist/index.mjs", format : "es", sourcemap : true},
			{file : "dist/index.cjs", format : "cjs", exports : "default", sourcemap : true},
		],
	},

	// Core: UMD for <script> tag (global "AudioRecorder")
	{
		input : coreInput,
		plugins : basePlugins,
		output : {
			file : "dist/audiorecorder.js",
			format : "umd",
			name : "AudioRecorder",
			sourcemap : true,
		},
	},
	
	// Core: UMD - minified
	{
		input : coreInput,
		plugins : [basePlugins, minify],
		output : {
			file : "dist/audiorecorder.min.js",
			format : "umd",
			name : "AudioRecorder",
			sourcemap : true,
		},
	},

	// Worker (build as IIFE for simple script-url usage)
	{
		input : "src/mp3worker/mp3worker.js",
		plugins : [
			basePlugins,
			isProd && minify
		].filter(Boolean),
		output : {file : "dist/mp3worker.js", format : "iife", name : "MP3Worker", sourcemap : true},
	},

	// React wrapper: ESM + CJS for app usage
	{
		input : "src/react.js",
		external : ["react"],
		plugins : basePlugins,
		output : [
			{file : "dist/react.mjs", format : "es", sourcemap : true},
			{file : "dist/react.cjs", format : "cjs", exports : "auto", sourcemap : true},
		],
	},
];
