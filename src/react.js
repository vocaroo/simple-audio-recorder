import {useRef, useState, useEffect} from "react";
import AudioRecorder from "./AudioRecorder.js";

export const RecorderStates = {
	INITIAL : 0,
	STARTING : 1,
	RECORDING : 2,
	PAUSED : 3,
	ENCODING : 4,
	COMPLETE : 5,
	ERROR : 6
};

function useInterval(updateFunc, timeStep = 1000/60.0) {
	const intervalIdRef = useRef(null);
	
	useEffect(() => {
		intervalIdRef.current = setInterval(updateFunc, timeStep);
		
		return () => {
			intervalIdRef.current && clearInterval(intervalIdRef.current);
		};
	}, []);
}

export function useSimpleAudioRecorder({
	workerUrl, onDataAvailable, onComplete, onError, options, cleanup = false, timeUpdateStep = 111
}) {
	const [recorderState, setRecorderState] = useState(RecorderStates.INITIAL);
	const [mp3Blobs, setMp3Blobs] = useState([]);
	const [mp3Urls, setMp3Urls] = useState([]);
	const [error, setError] = useState(null);
	const [time, setTime] = useState(0);
	
	const recorderRef = useRef(null);
	const audioDataRef = useRef(null);
	
	useEffect(() => {
		if (workerUrl) {
			AudioRecorder.preload(workerUrl);
		}
		
		return () => {
			if (recorderRef.current) {
				recorderRef.current.ondataavailable = null;
				recorderRef.current.onstart = null;
				recorderRef.current.onstop = null;
				recorderRef.current.onerror = null;
				recorderRef.current.stop();
				recorderRef.current = null;
			}
			
			if (cleanup) {
				mp3Urls.forEach(URL.revokeObjectURL);
			}
		};
	}, []);
	
	useInterval(() => {
			recorderRef.current && setTime(recorderRef.current.time);
	}, timeUpdateStep);
	
	function start() {
		audioDataRef.current = [];
		recorderRef.current = new AudioRecorder({...options, streaming : true});
		
		setRecorderState(RecorderStates.STARTING);
		
		recorderRef.current.ondataavailable = (data) => {
			audioDataRef.current.push(data);
			onDataAvailable && onDataAvailable(data);
		};
		
		recorderRef.current.onstart = () => {
			setRecorderState(RecorderStates.RECORDING);
			setError(null);
		};
		
		recorderRef.current.onstop = () => {
			// Combine all the mp3 data chunks from the audioData array into a Blob
			const mp3Blob = new Blob(audioDataRef.current, {type : "audio/mpeg"});
			const mp3Url = URL.createObjectURL(mp3Blob);
			setRecorderState(RecorderStates.COMPLETE);
			setMp3Blobs([...mp3Blobs, mp3Blob]);
			setMp3Urls([...mp3Urls, mp3Url]);
			onComplete && onComplete({mp3Blob, mp3Url});
		};
		
		recorderRef.current.onerror = (error) => {
			setRecorderState(RecorderStates.ERROR);
			setError(error);
			onError && onError(error);
		};
		
		recorderRef.current.start();
	}
	
	function stop() {
		if (recorderRef.current.getEncodingQueueSize() > 1000) {
			// If there's a fair amount of data left, we'll enter the ENCODING state.
			// (so a spinner or something could be shown)
			setRecorderState(RecorderStates.ENCODING);
		}
		
		recorderRef.current.stop();
	}
	
	function pause() {
		recorderRef.current.pause();
		setRecorderState(RecorderStates.PAUSED);
	}
	
	function resume() {
		recorderRef.current.resume();
		setRecorderState(RecorderStates.RECORDING);
	}
	
	const props = {start, stop, pause, resume, recorderState};
	
	return {
		error,
		errorStr : error ? error.toString() : null,
		time,
		mp3Blobs,
		mp3Urls,
		mp3Blob : mp3Blobs.at(-1),
		mp3Url : mp3Urls.at(-1),
		...props,
		getProps : () => props
	};
}

export function SimpleAudioRecorder({
	start, stop, pause, resume, recorderState,
	viewInitial, viewStarting, viewRecording, viewPaused, viewEncoding, viewComplete, viewError
}) {
	// Only viewInitial and viewRecording are required.
	// Others will default to one of viewInitial or viewRecording if not specified, for a simpler UI.
	viewStarting = viewStarting ?? viewRecording;
	viewPaused = viewPaused ?? viewInitial;
	viewEncoding = viewEncoding ?? viewComplete;
	viewComplete = viewComplete ?? viewInitial;
	viewError = viewError ?? viewInitial;
	
	const stateMap = new Map();
	stateMap.set(RecorderStates.INITIAL, viewInitial);
	stateMap.set(RecorderStates.STARTING, viewStarting);
	stateMap.set(RecorderStates.RECORDING, viewRecording);
	stateMap.set(RecorderStates.PAUSED, viewPaused);
	stateMap.set(RecorderStates.ENCODING, viewEncoding);
	stateMap.set(RecorderStates.COMPLETE, viewComplete);
	stateMap.set(RecorderStates.ERROR, viewError);
	
	return stateMap.get(recorderState) ?? RecorderStates.INITIAL;
}

export function preloadWorker(workerUrl) {
	AudioRecorder.preload(workerUrl);
}
