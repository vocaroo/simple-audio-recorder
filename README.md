# Simple Audio Recorder

![](https://raw.githubusercontent.com/bobbles911/simple-audio-recorder/master/.github/GitHubAudioRecorderHeader.png)

A simple web audio recording library with encoding to MP3 (using [lamejs](https://github.com/zhuker/lamejs)) and optional streaming/chunked output. Made by [Vocaroo, the quick and easy online voice recorder](https://vocaroo.com)!

Why use an MP3 encoder when the MediaRecorder API is available? Because MP3 is the most widely recognised and compatible format, and there is no guarantee of what formats MediaRecorder supports (but it's usually Opus). The resulting Opus file can still only be played back on certain browsers, while MP3 has close to 100% support. Sometimes, you _need_ to give your users an MP3 file!

```javascript
import AudioRecorder from "simple-audio-recorder";

AudioRecorder.preload({
	workletUrl : "mp3worklet.js",
	workerUrl : "mp3worker.js"
});

let recorder = new AudioRecorder();

recorder.start().then(() => {
	console.log("Recording started...");
}).catch(error => {
	console.log(error);
});

recorder.stop().then(mp3Blob => {
	console.log("Recording stopped...");

	const newAudio = document.createElement("audio");
	newAudio.src = URL.createObjectURL(mp3Blob);
	newAudio.controls = true;
	document.body.append(newAudio);
}).catch(error => {
	console.log(error);
});
```

## Examples

Look in the ./examples/ directory. Start them with:
```bash
yarn install
yarn start
```
...or whatever the npm equivalant is.

## Usage

### Including

```javascript
yarn add simple-audio-recorder
```

```javascript
import AudioRecorder from "simple-audio-recorder";
```

Alternatively, just use a script tag:
```javascript
<script type="text/javascript" src="audiorecorder.js"></script>
```
Also, you must make sure that you distribute the web worker / worklet files "mp3worklet.js" and "mp3worker.js" along with your application.

### Preload the MP3 encoder workers:

```javascript
// This is a static method.
// You should preload the worker immediately on page load to enable recording to start quickly
// Either the worklet OR worker will be preloaded (but not both), depending on the browser support.
AudioRecorder.preload({
	workletUrl : "./mp3worklet.js",
	workerUrl : "./mp3worker.js",

	// Used for debugging only. Force a preload of both the worklet and worker.
	// preloadBoth : true
});
```

### Create an audio recorder

```javascript
let recorder = new AudioRecorder({
	recordingGain : 1, // Initial recording volume
	encoderBitRate : 96, // MP3 encoding bit rate
	streaming : false, // Data will be returned in chunks (ondataavailable callback) as it is encoded,
						// rather than at the end as one large blob
	streamBufferSize : 50000, // Size of encoded mp3 data chunks returned by ondataavailable, if streaming is enabled
	constraints : { // Optional audio constraints, see https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
		channelCount : 1, // Set to 2 to hint for stereo if it's available, or leave as 1 to force mono at all times
		autoGainControl : true,
		echoCancellation : true,
		noiseSuppression : true
	},

	// Used for debugging only. Force using the older script processor instead of AudioWorklet.
	// Will break preloading unless preloadBoth was used.
	// forceScriptProcessor : true
});
```

### Use promises to start and stop recording

```javascript
recorder.start().then(() => {
	console.log("Recording started...");
}).catch(error => {
	console.log(error);
});

recorder.stop().then(mp3Blob => {
	// Do something with the mp3 Blob!
}).catch(error => {
	console.log(error);
});
```

### Or use events

```javascript
recorder.onstart = () => {
	console.log("Recording started...");
};

recorder.onstop = (mp3Blob) => {
	// Do something with the mp3 Blob!
	// When using onstop, mp3Blob could in rare cases be null if nothing was recorded
	// (with the Promise API, that would be a stop() promise rejection)
};

recorder.onerror = (error) => {
	console.log(error);
};

// if onerror is set, start and stop won't return a promise
recorder.start();

// later...
recorder.stop();
```

### Handle encoded data chunks

Want to receive encoded data chunks as they are produced? Useful for streaming uploads to a remote server.

```javascript
let recorder = new AudioRecorder({
	streaming : true,
	streamBufferSize : 50000
});

let audioChunks = [];

recorder.ondataavailable = (data) => {
	// 50 KB of MP3 data received!
	audioChunks.push(data);
};

recorder.start();

// No mp3Blob will be received either with the promise API or via recorder.onstop if streaming is enabled.
recorder.stop().then(() => {
	// ...do something with all the chunks that were received by ondataavailable
	let mp3Blob = new Blob(audioChunks, {type : "audio/mpeg"});
});
```

### Other functions/attributes

```javascript
recorder.pause();
recorder.resume();

recorder.setRecordingGain(gain); // Change the volume while recording is in progress (0.0 to 1.0)

recorder.time; // Access the current recorded duration in milliseconds. Time pauses when recording is paused.

AudioRecorder.isRecordingSupported(); // Static method. Does this browser support getUserMedia?
```

### Error handling

Error handling can be done either via promises and catching errors, or via the onerror event handler if it is set.

#### Errors

These are named via the error.name property

- **CancelStartError** - if stop() is called while start() has not completed (perhaps due to slow loading of the workers), then both the start and stop promises will reject with this error. However, if using the onerror event handler this error will **not** be given (as it's not _really_ an error, but a deliberate action of the user). In that case, the onstop event handler will receive null instead of an mp3 Blob.
- **WorkerError** - there was some problem loading the workers, maybe the URLs were incorrect or the internet broke
- _getUserMedia errors_ - any error that [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) can fail with, such as NotAllowedError or NotFoundError
- _Miscellaneous unnamed errors_ - if you do something like calling start() while recording has already started, or forgetting to call preload() before creating an AudioRecorder, then you'll probably see some other errors.

### Known issues

Simple Audio Recorder encodes using an AudioWorkletNode where supported, and falls back to using the deprecated ScriptProcessorNode along with a regular Web Worker on older browsers. However, there seem to be some occasional issues using AudioWorkletNode on iOS/Safari. After about 45 seconds, audio packets from the microphone start to get dropped, creating a recording that is shorter than expected with stuttering and glitches. So currently, the deprecated ScriptProcessorNode will always be used on iOS/Safari.

AFAIK this is an unsolved issue, perhaps related to Safari's implementation of AudioWorklets and them not being given enough CPU priority. These issues only appear on some devices.

Curiously, similar glitches have also been experienced when using ScriptProcessorNode on Chrome.

## Licenses
SimpleAudioRecorder is mostly MIT licenced, but the worklet and worker are probably LGPL as they use [lamejs](https://github.com/zhuker/lamejs).