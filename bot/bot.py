"""digital-lluc — the voice/text agent behind Lluc's website.

Pipeline: Deepgram (STT) -> OpenAI (LLM) -> Cartesia (TTS). RTVI is enabled
by default on PipelineWorker, so text messages sent by the web client and
the on-screen transcript both work the same way they did on the prior
Gemini Live speech-to-speech pipeline.

Run locally:   uv run bot.py --transport webrtc --port 7080
Deploy:        pcc deploy   (see pcc-deploy.toml)
"""

import asyncio
import json
import os
import time
import uuid
import wave
from io import BytesIO

from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import EndFrame, Frame, LLMRunFrame, MetricsFrame
from pipecat.metrics.metrics import LLMUsageMetricsData
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.audio.audio_buffer_processor import AudioBufferProcessor
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams
from pipecat.transports.smallwebrtc.request_handler import (
    SmallWebRTCPatchRequest,
    SmallWebRTCRequestHandler,
)
from pipecat.workers.runner import WorkerRunner

from persona.prompt import build_system_prompt
from storage import record_session, upload_blob

# Workaround for a pipecat-ai 1.5.0 bug: browsers send an empty-string ICE
# candidate as the standard trickle-ICE "end of candidates" marker, but
# aiortc's candidate_from_sdp() asserts on it instead of ignoring it, 500ing
# every ICE PATCH (surfaces client-side as "NetworkError when attempting to
# fetch resource"). Strip empty candidates before handing off to pipecat.
_original_handle_patch_request = SmallWebRTCRequestHandler.handle_patch_request


async def _handle_patch_request_skip_empty_candidates(
    self, request: SmallWebRTCPatchRequest
):
    request.candidates = [c for c in request.candidates if c.candidate]
    await _original_handle_patch_request(self, request)


SmallWebRTCRequestHandler.handle_patch_request = (
    _handle_patch_request_skip_empty_candidates
)

MAX_SESSION_SECS = int(os.environ.get("MAX_SESSION_SECS", "600"))
IDLE_TIMEOUT_SECS = int(os.environ.get("IDLE_TIMEOUT_SECS", "120"))


class TokenUsageCollector(FrameProcessor):
    """Accumulates LLM token usage across a session for the recorded session metrics."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.prompt_tokens = 0
        self.completion_tokens = 0

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, MetricsFrame):
            for entry in frame.data:
                if isinstance(entry, LLMUsageMetricsData):
                    self.prompt_tokens += entry.value.prompt_tokens
                    self.completion_tokens += entry.value.completion_tokens
        await self.push_frame(frame, direction)


transport_params = {
    "daily": lambda: DailyParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
    ),
    "webrtc": lambda: TransportParams(
        audio_in_enabled=True,
        audio_out_enabled=True,
    ),
}


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    session_id = str(uuid.uuid4())
    user_id = (runner_args.body or {}).get("user") or "anonymous"
    session_started_at = time.time()

    stt = DeepgramSTTService(api_key=os.environ["DEEPGRAM_API_KEY"])

    tts_voice = os.environ.get("CARTESIA_VOICE") or "71a7ad14-091c-4e8e-a314-022ece01c121"
    tts = CartesiaTTSService(
        api_key=os.environ["CARTESIA_API_KEY"],
        settings=CartesiaTTSService.Settings(voice=tts_voice),
    )

    llm_model = os.environ.get("OPENAI_MODEL") or "gpt-4o-mini"
    llm = OpenAILLMService(
        api_key=os.environ["OPENAI_API_KEY"],
        settings=OpenAILLMService.Settings(model=llm_model),
    )
    logger.info(f"🧠 LLM: OpenAI {llm_model}")

    context = LLMContext(
        messages=[{"role": "system", "content": build_system_prompt()}]
    )
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )

    audiobuffer = AudioBufferProcessor(num_channels=1, auto_start_recording=True)
    token_usage = TokenUsageCollector()

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            audiobuffer,
            token_usage,
            assistant_aggregator,
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        enable_rtvi=True,
        idle_timeout_secs=IDLE_TIMEOUT_SECS,
        cancel_on_idle_timeout=True,
    )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        context.add_message(
            {
                "role": "developer",
                "content": "Start the call by saying hello.",
            }
        )
        await worker.queue_frames([LLMRunFrame()])
        logger.info("🔌 Client connected")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("👋 Client disconnected")
        await worker.cancel()

    recorded_audio: dict = {}

    @audiobuffer.event_handler("on_audio_data")
    async def on_audio_data(buffer, audio, sample_rate, num_channels):
        recorded_audio["audio"] = audio
        recorded_audio["sample_rate"] = sample_rate
        recorded_audio["num_channels"] = num_channels

    async def save_session():
        transcript_json = json.dumps(
            {
                "transcript": context.messages,
                "tokenUsage": {
                    "promptTokens": token_usage.prompt_tokens,
                    "completionTokens": token_usage.completion_tokens,
                },
            }
        ).encode()

        audio_path = None
        if recorded_audio.get("audio"):
            wav_buffer = BytesIO()
            with wave.open(wav_buffer, "wb") as wav_file:
                wav_file.setnchannels(recorded_audio["num_channels"])
                wav_file.setsampwidth(2)
                wav_file.setframerate(recorded_audio["sample_rate"])
                wav_file.writeframes(recorded_audio["audio"])
            audio_path = await upload_blob(
                f"audio/{user_id}/{session_id}.wav", wav_buffer.getvalue(), "audio/wav"
            )

        transcript_path = await upload_blob(
            f"transcripts/{user_id}/{session_id}.json", transcript_json, "application/json"
        )

        await record_session(
            session_id,
            {
                "userId": user_id,
                "startedAt": session_started_at,
                "durationSecs": round(time.time() - session_started_at),
                "audioPath": audio_path or "",
                "transcriptPath": transcript_path or "",
                "promptTokens": token_usage.prompt_tokens,
                "completionTokens": token_usage.completion_tokens,
            },
        )

    async def enforce_max_duration():
        await asyncio.sleep(MAX_SESSION_SECS)
        logger.info(f"⏰ Max session duration ({MAX_SESSION_SECS}s) reached")
        context.add_message(
            {
                "role": "developer",
                "content": (
                    "The session time limit was reached. Say a one-sentence "
                    "goodbye and mention they can email the real Lluc."
                ),
            }
        )
        await worker.queue_frames([LLMRunFrame()])
        await asyncio.sleep(10)
        logger.info("🛑 Ending session after goodbye")
        await worker.queue_frames([EndFrame()])

    watchdog = asyncio.create_task(enforce_max_duration())

    logger.info("🚀 Starting pipeline worker")
    runner = WorkerRunner(
        handle_sigint=getattr(runner_args, "handle_sigint", False)
    )
    try:
        await runner.add_workers(worker)
        await runner.run()
    finally:
        watchdog.cancel()
        await save_session()
        logger.info("🏁 Pipeline worker stopped")


async def bot(runner_args: RunnerArguments):
    """Entry point used by both the local dev runner and Pipecat Cloud."""
    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
