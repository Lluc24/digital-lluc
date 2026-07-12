"""digital-lluc — the voice/text agent behind Lluc's website.

One Pipecat pipeline serves every modality through Gemini Live
(speech-to-speech): the web client toggles audio in/out, text messages
arrive as RTVI send-text messages handled by the built-in RTVI support
(enable_rtvi on PipelineWorker), and Gemini Live's built-in transcription
feeds the on-screen transcript.

Run locally:   uv run bot.py --transport webrtc --port 7080
Deploy:        pcc deploy   (see pcc-deploy.toml)
"""

import asyncio
import os

from loguru import logger

from pipecat.frames.frames import EndFrame, LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams
from pipecat.workers.runner import WorkerRunner

from persona.prompt import build_system_prompt

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
    settings = GeminiLiveLLMService.Settings(
        system_instruction=build_system_prompt(),
        context_window_compression={"enabled": True},
    )
    # Let the service defaults pick model/voice unless overridden via env.
    if os.environ.get("GEMINI_MODEL"):
        settings.model = os.environ["GEMINI_MODEL"]
    if os.environ.get("GEMINI_VOICE"):
        settings.voice = os.environ["GEMINI_VOICE"]

    llm = GeminiLiveLLMService(
        api_key=os.environ["GOOGLE_API_KEY"],
        settings=settings,
    )

    context = LLMContext()
    # Gemini Live is a realtime (speech-to-speech) service: server-side VAD
    # handles turn-taking, and realtime_service_mode keeps context-writing
    # correct without a local VAD analyzer.
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        realtime_service_mode=True,
    )

    pipeline = Pipeline(
        [
            transport.input(),
            user_aggregator,
            llm,
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
                "role": "system",
                "content": "Say hello",
            }
        )
        await worker.queue_frames([LLMRunFrame()])
        logger.info("Client connected")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Client disconnected")
        await worker.cancel()

    async def enforce_max_duration():
        await asyncio.sleep(MAX_SESSION_SECS)
        logger.info(f"Max session duration ({MAX_SESSION_SECS}s) reached")
        # No TTS service in a speech-to-speech pipeline, so the goodbye has
        # to come from Gemini itself; give it a moment before ending.
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
        await worker.queue_frames([EndFrame()])

    watchdog = asyncio.create_task(enforce_max_duration())

    runner = WorkerRunner(
        handle_sigint=getattr(runner_args, "handle_sigint", False)
    )
    try:
        await runner.add_workers(worker)
        await runner.run()
    finally:
        watchdog.cancel()


async def bot(runner_args: RunnerArguments):
    """Entry point used by both the local dev runner and Pipecat Cloud."""
    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
