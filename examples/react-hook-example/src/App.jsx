import {SimpleAudioRecorder, useSimpleAudioRecorder} from "simple-audio-recorder/react";

export default function App() {
	const recorder = useSimpleAudioRecorder({
		workerUrl : "mp3worker.js",
		onDataAvailable : data => console.log("DATA AVAILABLE", data.length),
		onComplete : mp3Blob => console.log("RECORDING COMPLETE!", mp3Blob),
		onError : error => console.log("RECORDING ERROR!", error)
	});
    	
	const viewInitial = (
		<button onClick={recorder.start}>start recording</button>
	);
	
	const viewRecording = (
		<button onClick={recorder.stop}>
			stop recording ({(recorder.time / 1000.0).toFixed(2) + "s"})
		</button>
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
				viewRecording={viewRecording}
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
