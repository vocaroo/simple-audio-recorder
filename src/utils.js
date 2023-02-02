
export function stopStream(stream) {
	if (stream.getTracks) {
		stream.getTracks().forEach(track => track.stop());
	} else {
		stream.stop(); // Deprecated
	}
}

// https://stackoverflow.com/a/9039885
export function detectIOS() {
	return [
		'iPad Simulator',
		'iPhone Simulator',
		'iPod Simulator',
		'iPad',
		'iPhone',
		'iPod'
	].includes(navigator.platform)
		// iPad on iOS 13 detection
		|| (navigator.userAgent.includes("Mac") && "ontouchend" in document);
}

export function detectSafari() {
	return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function is_iPhone_OS_16_1() {
	return window.navigator.userAgent.includes("iPhone OS 16_1");
}
