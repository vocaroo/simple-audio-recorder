import {SimpleAudioRecorder, useSimpleAudioRecorder} from "../../../src/react.js";

export default function App() {
	const recorder = useSimpleAudioRecorder({
		workerUrl : "mp3worker.js",
		onDataAvailable : data => console.log("DATA AVAILABLE", data.length),
		onComplete : mp3Blob => console.log("RECORDING COMPLETE!", mp3Blob),
		onError : error => console.log("RECORDING ERROR!", error),
		countdown : 3000
	});

	const viewInitial = (
		<button onClick={recorder.start}>start recording</button>
	);

	const viewCountdown = (
		<button disabled>
			Recording in {Math.ceil(recorder.countdownTimeLeft / 1000.0)}...
		</button>
	);
	
	const viewRecording = (
		<>
			<button onClick={recorder.stop}>
			stop recording ({(recorder.time / 1000.0).toFixed(2) + "s"})
			</button>
			<button onClick={recorder.pause}>
			pause
			</button>
		</>
	);
	
	const viewPaused = (
		<>
			<button onClick={recorder.stop}>
			stop recording ({(recorder.time / 1000.0).toFixed(2) + "s"})
			</button>
			<button onClick={recorder.resume}>resume</button>
		</>
	);
	
	const viewError = (
		<>
			{viewInitial}
			<div>Error occurred! {recorder.errorStr}</div>
		</>
	);
	
	return (
		<div>
			<SimpleAudioRecorder
				{...recorder.getProps()}
				viewInitial={viewInitial}
				viewCountdown={viewCountdown}
				viewRecording={viewRecording}
				viewPaused={viewPaused}
				viewError={viewError}/>
			
			<hr/>
			
			{recorder.mp3Urls.toReversed().map(url => 
				<div key={url}>
				<audio src={url} controls/>
				</div>
			)}
		</div>
	);
}
