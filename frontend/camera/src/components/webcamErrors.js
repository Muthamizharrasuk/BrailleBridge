export function describeCameraError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow the camera in your browser settings, or upload a photo instead.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. Upload a photo instead.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is busy or unavailable. Close other apps using it, or upload a photo instead.';
    default:
      return `Could not start the camera${error?.message ? `: ${error.message}` : ''}. Upload a photo instead.`;
  }
}

export function cameraSupported() {
  return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
}
