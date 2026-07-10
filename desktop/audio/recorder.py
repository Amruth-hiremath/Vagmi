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

                with self._lock:
                    self._frames.append(indata.copy())

            self._stream = sd.InputStream(
                samplerate=self._samplerate,
                channels=self._channels,
                callback=callback
            )

            self._stream.start()

    def stop(self):

        with self._lock:

            stream = self._stream

            if stream is None:
                return None

            self._stream = None

        # Stop and close the stream outside the lock
        stream.stop()
        stream.close()

        # Safely copy the recorded frames
        with self._lock:

            if len(self._frames) == 0:
                return None

            frames = self._frames[:]
            self._frames = []

        audio = np.concatenate(
            frames,
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
        ).decode("utf-8")

        return (
            "data:audio/wav;base64,"
            + data
        )