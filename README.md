# Simple Audio Recorder

![](https://raw.githubusercontent.com/bobbles911/simple-audio-recorder/master/.github/GitHubAudioRecorderHeader.png)

A simple web audio recording library with encoding to MP3 (using [lamejs](https://github.com/zhuker/lamejs)) and optional streaming/chunked output. Made by [Vocaroo, the quick and easy online voice recorder](https://vocaroo.com)!

Now including both a vanilla-js version and an _astonishingly_ easy to use react hook and component!

### Vanilla-js

```javascript
import AudioRecorder from "simple-audio-recorder";

AudioRecorder.preload("mp3worker.js");

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

### React hook and component

```JSX
import {SimpleAudioRecorder, useSimpleAudioRecorder} from "simple-audio-recorder/react";

export default function App() {
	const recorder = useSimpleAudioRecorder({workerUrl : "mp3worker.js"});
    	
	const viewInitial = <button onClick={recorder.start}>start recording</button>;
	const viewRecording = <button onClick={recorder.stop}>stop recording</button>;
	const viewError = (<>{viewInitial} <div>Error occurred! {recorder.errorStr}</div></>);
	
	return (
		<div>
			<SimpleAudioRecorder
				{...recorder.getProps()}
				viewInitial={viewInitial}
				viewRecording={viewRecording}
				viewError={viewError}/>
            
            {recorder.mp3Urls.map(url => 
                <audio key={url} src={url} controls/>
            )}
		</div>
	);
}
```

## Examples

### On codepen

- [Minimal promise example](https://codepen.io/bobbles911/pen/JjBzPvm)
- [Main example of all features](https://codepen.io/bobbles911/pen/rNrRBZd)

### Included in the project

- [Minimal promise example](examples/minimal-example-promises)
- [Main example of all features](examples/main-example)
- [React hook and component example](examples/react-hook-example)

To run the built in examples in the ./examples/ directory, start a dev server from the project root and then navigate to them.

Or start developing with:

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
Also, you must make sure that you distribute the web worker file "mp3worker.js" along with your application.

### Preload the MP3 encoder worker:

```javascript
// This is a static method.
// You should preload the worker immediately on page load to enable recording to start quickly
AudioRecorder.preload("./mp3worker.js");
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

// Get the amount of data remaining to be encoded
// Will only be much above zero on very slow systems as mp3 encoding is quite fast.
// A large value indicates there might be a delay between calling stop() and getting the mp3Blob
recorder.getEncodingQueueSize();

AudioRecorder.isRecordingSupported(); // Static method. Does this browser support getUserMedia?
```

### Error handling

Error handling can be done either via promises and catching errors, or via the onerror event handler if it is set.

#### Errors

These are named via the error.name property

- **CancelStartError** - if stop() is called while start() has not completed (perhaps due to slow loading of the worker), then both the start and stop promises will reject with this error. However, if using the onerror event handler this error will **not** be given (as it's not _really_ an error, but a deliberate action of the user). In that case, the onstop event handler will receive null instead of an mp3 Blob.
- **WorkerError** - there was some problem loading the worker, maybe the URL was incorrect or the internet broke
- _getUserMedia errors_ - any error that [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) can fail with, such as NotAllowedError or NotFoundError
- _Miscellaneous unnamed errors_ - if you do something like calling start() while recording has already started, or forgetting to call preload() before creating an AudioRecorder, then you'll probably see some other errors.

### React hook and component

Please see the [react hook and component example](examples/react-hook-example) for a working example of usage.

#### Importing

```javascript
import {useSimpleAudioRecorder, SimpleAudioRecorder, preloadWorker, RecorderStates} from "simple-audio-recorder/react"
```

#### useSimpleAudioRecorder hook

```javascript
const {
	error, // Any current error object, or null
	errorStr, // Error object as string, or null
	time, // Current recorded time in milliseconds
	mp3Blobs, // List of all recordings as a blob
	mp3Urls, // List of all recordings as URLs (created with URL.createObjectURL)
	mp3Blob, // Single most recent recording blob
	mp3Url, // Single most recent recording URL
	start, stop, pause, resume, // Recording functions
	recorderState, // Current state of recorder (see RecorderStates)
	getProps // Function to get the props that can be passed to the SimpleAudioRecorder react component
} = useSimpleAudioRecorder({
	workerUrl, onDataAvailable, onComplete, onError, options, cleanup = false, timeUpdateStep = 111
})
```

- **workerUrl** - URL of the mp3 encoder. Can alternatively be specified using preloadWorker()
- **onDataAvailable** - optional callback to receive encoded data as it is created.
- **onComplete** - optional callback, receives the mp3 blob when recording and encoding is finished.
- **onError** - optional callback, receives any error object.
- **options** - see the documentation for AudioRecorder.
- **cleanup** - if true, any mp3Urls created via URL.createObjectURL will be freed when unmounting. By default, this is false, and you may need to free them yourself if there is an excessive amount of recordings.
- **timeUpdateStep** - how often in milliseconds the returned time will be updated.

#### SimpleAudioRecorder component

This is a very simply state machine component that shows a different view component depending on the current recorder state.

```javascript
SimpleAudioRecorder({
	// As returned by useSimpleAudioRecorder
	recorderState,
	// The components to display in each of the states.
	// Only viewInitial and viewRecording are absolutely required.
	viewInitial, viewStarting, viewRecording, viewPaused, viewEncoding, viewComplete, viewError
})
```

- **viewInitial** - initial state of the recorder, you should show a "start recording" button that calls the `start` function from useSimpleAudioRecorder.
- **viewStarting** - optional state, will show when recording is starting but has not yet started, for example while the user is responding to the microphone access prompt.
- **viewRecording** - required state, recording is in progress! You may want to show stop and pause buttons here that call the `stop` and `pause` functions.
- **viewPaused** - required if the pause function is used. Show resume or stop buttons.
- **viewEncoding** - optional. This may show in very rare cases when the user has a very slow device and mp3 encoding is still ongoing after recording has been stopped.
- **viewComplete** - optional, shown after recording has completed successfully. Defaults to viewInitial.
- **viewError** - optional, but highly recommended. Shown when there is a recording error. You can display the contents of the error object or errorStr from useSimpleAudioRecorder.

#### preloadWorker(workerUrl)

Instead of passing a workerUrl to `useSimpleAudioRecorder`, it's better to call this function somewhere at the start of your app to preload the worker as soon as possible.

#### RecorderStates

An enumeration of possible recorder states. Used by the SimpleAudioRecorder component.

```javascript
RecorderStates = {
	INITIAL,
	STARTING,
	RECORDING,
	PAUSED,
	ENCODING,
	COMPLETE,
	ERROR
}
```

### Known issues

#### iOS/Safari

Simple Audio Recorder uses an AudioWorkletNode to extract the audio data, where supported, and falls back to using the deprecated ScriptProcessorNode on older browsers. However, there seem to be some occasional issues using AudioWorkletNode on iOS/Safari. After about 45 seconds, audio packets from the microphone start to get dropped, creating a recording that is shorter than expected with stuttering and glitches. So currently, the deprecated ScriptProcessorNode will always be used on iOS/Safari.

AFAIK this is an unsolved issue, perhaps related to Safari's implementation of AudioWorklets and them not being given enough CPU priority. These issues only appear on some devices. Curiously, similar glitches have also been experienced when using the old ScriptProcessorNode on Chrome on other platforms.

Chrome isn't any better on iOS either as they are forced to use Safari under the hood (somehow, [this feels rather familiar](https://en.wikipedia.org/wiki/United_States_v._Microsoft_Corp.)).

## Licenses
SimpleAudioRecorder is mostly MIT licenced, but the worker is probably LGPL as it uses [lamejs](https://github.com/zhuker/lamejs).