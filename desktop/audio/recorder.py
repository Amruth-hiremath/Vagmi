from __future__ import annotations

import io
import threading
import base64
import numpy as np
import sounddevice as sd
import soundfile as sf


class VoiceRecorder:

    def __init__(self):

        self._samplerate = 16000
        self._channels = 1

        self._frames = []

        self._stream = None

        self._lock = threading.Lock()

    def start(self):

        with self._lock:

            if self._stream is not None:
                return

            self._frames = []

            def callback(indata, frames, time, status):

                if status:
                    print(status)

                self._frames.append(indata.copy())

            self._stream = sd.InputStream(
                samplerate=self._samplerate,
                channels=self._channels,
                callback=callback
            )

            self._stream.start()    

    def stop(self):

        with self._lock:

            if self._stream is None:
                return None

            self._stream.stop()
            self._stream.close()
            self._stream = None

            if not self._frames:
                return None

            audio = np.concatenate(
                self._frames,
                axis=0
            )

            buffer = io.BytesIO()

            sf.write(
                buffer,
                audio,
                self._samplerate,
                format="WAV"
            )

            data = base64.b64encode(
                buffer.getvalue()
            ).decode()

            return (
                "data:audio/wav;base64,"
                + data
            )        