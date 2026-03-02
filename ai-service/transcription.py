import os
from faster_whisper import WhisperModel

# Get whisper model from environment, default to 'tiny' for low memory
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "tiny")

# When WHISPER_MODEL_DIR is set (e.g. by the Windows installer), models are
# stored in the app's own directory instead of the user's HuggingFace cache.
# This keeps the install self-contained and avoids permission issues when
# running as a Windows Service under a different account.
WHISPER_MODEL_DIR = os.getenv("WHISPER_MODEL_DIR", None)

# Lazy load the model
_model = None


def get_model():
    """Get or create the Whisper model (lazy loading)."""
    global _model
    if _model is None:
        # Use CPU with int8 quantization for low memory usage
        _model = WhisperModel(
            WHISPER_MODEL,
            device="cpu",
            compute_type="int8",
            download_root=WHISPER_MODEL_DIR,  # None = default HuggingFace cache
        )
    return _model


def transcribe_audio(filepath: str) -> str:
    """
    Transcribe an audio/video file using faster-whisper.

    Args:
        filepath: Path to the audio/video file

    Returns:
        Transcribed text
    """
    model = get_model()

    # Transcribe the file
    segments, info = model.transcribe(
        filepath,
        beam_size=5,
        language="en",  # Can be set to None for auto-detection
        vad_filter=True,  # Filter out non-speech
        vad_parameters=dict(
            min_silence_duration_ms=500,
        )
    )

    # Combine all segments into a single transcript
    transcript_parts = []
    for segment in segments:
        transcript_parts.append(segment.text.strip())

    transcript = " ".join(transcript_parts)

    return transcript
