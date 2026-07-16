"""digital-lluc — the voice/text agent behind Lluc's website.

Pipeline: Deepgram (STT) -> OpenAI (LLM) -> Cartesia (TTS). RTVI is enabled
by default on PipelineWorker, so text messages sent by the web client and
the on-screen transcript both work the same way they did on the prior
Gemini Live speech-to-speech pipeline.

Run locally:   uv run bot.py --transport webrtc --port 7080
Deploy:        pcc deploy   (see pcc-deploy.toml)
"""

import asyncio
import os

from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import EndFrame, LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
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
    stt = DeepgramSTTService(api_key=os.environ["DEEPGRAM_API_KEY"])

    tts_voice = os.environ.get("CARTESIA_VOICE") or "71a7ad14-091c-4e8e-a314-022ece01c121"
    tts = CartesiaTTSService(
        api_key=os.environ["CARTESIA_API_KEY"],
        settings=CartesiaTTSService.Settings(voice=tts_voice),
    )

    # OpenAI caches long, repeated prompt prefixes automatically (no opt-in
    # flag) once they exceed ~1024 tokens, so the system prompt as the first
    # context message is enough to get caching.
    llm_model = os.environ.get("OPENAI_MODEL") or "gpt-5-mini"
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

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
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
        logger.info("🏁 Pipeline worker stopped")


async def bot(runner_args: RunnerArguments):
    """Entry point used by both the local dev runner and Pipecat Cloud."""
    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
