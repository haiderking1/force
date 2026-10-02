import subprocess
import numpy as np


def decode_frames(movie, width, height):
    command = ["ffmpeg", "-hide_banner", "-v", "error", "-xerror", "-i", str(movie), "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
    child = subprocess.Popen(command, stdout=subprocess.PIPE)
    try:
        while True:
            raw = child.stdout.read(width*height*3)
            if not raw:
                break
            if len(raw) != width*height*3:
                raise ValueError("Incomplete decoded frame")
            yield np.frombuffer(raw, np.uint8).reshape(height, width, 3)
        if child.wait() != 0:
            raise RuntimeError("Movie decode failed")
    finally:
        child.stdout.close()
        if child.poll() is None:
            child.terminate()
            child.wait()
