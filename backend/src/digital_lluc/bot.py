"""Pipecat composition root: Deepgram (STT) -> OpenAI (LLM) -> Cartesia (TTS).

Local:  uv run python -m digital_lluc.bot -t webrtc   (see `make dev-bot`)
Cloud:  Pipecat Cloud's base image calls `bot()` from /app/bot.py.
"""

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, assert_never
from uuid import uuid4

from loguru import logger
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import EndFrame, Frame, LLMRunFrame, TTSSpeakFrame
from pipecat.observers.service_metrics_observer import (
    ServiceMetricsObserver,
    ServiceUsageKind,
    ServiceUsageRecord,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.audio.audio_buffer_processor import AudioBufferProcessor
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.transports.daily.transport import DailyParams
from pipecat.workers.runner import WorkerRunner
from pydantic import (
    BaseModel,
    ConfigDict,
    DirectoryPath,
    Field,
    PositiveInt,
    SecretStr,
    TypeAdapter,
)
from pydantic_settings import BaseSettings, SettingsConfigDict

from digital_lluc.application import RecordingStore
from digital_lluc.domain import (
    NO_TOKEN_USAGE,
    SessionAudio,
    SessionId,
    SessionRecording,
    SessionRequest,
    TokenUsage,
    TranscriptTurn,
    UserId,
)
from digital_lluc.persona import ProfileDocument, compose_system_prompt
from digital_lluc.recordings import LocalDirectoryRecordingStore, VercelBlobRecordingStore
from digital_lluc.sentry import init_sentry

_PROFILE_FILE_NAMES = ("BACKGROUND.yaml", "PERSONAL.yaml")
_RECORDING_SAMPLE_RATE_HZ = 16000
_GOODBYE = "That's all the time we have. If you want to keep talking, email the real Lluc. Bye!"


class _BaseBotSettings(BaseSettings):
    # Validation errors would otherwise echo the raw settings, secrets included, into the logs.
    model_config = SettingsConfigDict(hide_input_in_errors=True, env_ignore_empty=True)

    deepgram_api_key: SecretStr
    openai_api_key: SecretStr
    openai_model: str = "gpt-4o-mini"
    cartesia_api_key: SecretStr
    cartesia_voice_id: str = "71a7ad14-091c-4e8e-a314-022ece01c121"
    max_session_seconds: PositiveInt = 600
    idle_timeout_seconds: PositiveInt = 120
    profile_dir: DirectoryPath = Path("profile")
    sentry_dsn: SecretStr | None = None


class CloudBotSettings(_BaseBotSettings):
    deployment: Literal["cloud"]
    blob_read_write_token: SecretStr


class LocalBotSettings(_BaseBotSettings):
    deployment: Literal["local"]
    recordings_dir: Path = Path("recordings")


class _DeploymentSettings(BaseSettings):
    deployment: Literal["cloud", "local"]


def load_settings() -> CloudBotSettings | LocalBotSettings:
    match _DeploymentSettings().deployment:
        case "cloud":
            return CloudBotSettings(deployment="cloud")
        case "local":
            return LocalBotSettings(deployment="local")


class _SessionRequestBody(BaseModel):
    # Pydantic truncates echoed inputs, which defeats Sentry's identifier scrubbing.
    model_config = ConfigDict(hide_input_in_errors=True)

    session_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)


class _LegacySessionRequestBody(BaseModel):
    """The legacy bot/bot.py contract the live web/ site still sends."""

    # Forbidding extras keeps a partial new-shape body from being read as a legacy one.
    model_config = ConfigDict(hide_input_in_errors=True, extra="forbid")

    user: str = Field(min_length=1)


_SESSION_REQUEST_BODY = TypeAdapter(
    _SessionRequestBody | _LegacySessionRequestBody,
    config=ConfigDict(hide_input_in_errors=True),
)


class _ContextMessage(BaseModel):
    role: str
    content: str


_CONTEXT_MESSAGES = TypeAdapter(list[_ContextMessage])


def parse_session_request(runner_body: object, legacy_session_id: SessionId) -> SessionRequest:
    """Parses the body the session API sent through Pipecat Cloud or the local runner's /start.

    Post: a legacy {"user": ...} body, which carries no session id, gets `legacy_session_id`.
    """
    match _SESSION_REQUEST_BODY.validate_python(runner_body):
        case _SessionRequestBody(session_id=session_id, user_id=user_id):
            return SessionRequest(session_id=SessionId(session_id), user_id=UserId(user_id))
        case _LegacySessionRequestBody(user=user):
            return SessionRequest(session_id=legacy_session_id, user_id=UserId(user))


def recording_store(settings: CloudBotSettings | LocalBotSettings) -> RecordingStore:
    match settings:
        case CloudBotSettings():
            return VercelBlobRecordingStore()
        case LocalBotSettings():
            return LocalDirectoryRecordingStore(settings.recordings_dir)
        case _:
            assert_never(settings)


def load_system_prompt(profile_dir: Path) -> str:
    return compose_system_prompt(
        [
            ProfileDocument(name, (profile_dir / name).read_text(encoding="utf-8"))
            for name in _PROFILE_FILE_NAMES
        ]
    )


class TokenUsageTally:
    """Sums the per-inference LLM usage records ServiceMetricsObserver reports, which it never sums."""

    def __init__(self) -> None:
        self.token_usage = NO_TOKEN_USAGE

    async def on_service_usage(self, _: ServiceMetricsObserver, record: ServiceUsageRecord) -> None:
        if record.kind == ServiceUsageKind.LLM:
            self.token_usage = self.token_usage.plus(
                TokenUsage(record.prompt_tokens or 0, record.completion_tokens or 0)
            )


class AudioCapture:
    """Keeps the merged audio the recorder hands over when recording stops."""

    def __init__(self) -> None:
        self.audio: SessionAudio | None = None

    async def on_audio_data(
        self, _: AudioBufferProcessor, audio: bytes, sample_rate: int, num_channels: int
    ) -> None:
        self.audio = SessionAudio(audio, sample_rate, num_channels)


def transcript(context: LLMContext) -> tuple[TranscriptTurn, ...]:
    # Read from the context, not turn events: RTVI send-text appends to the context and fires none.
    messages = _CONTEXT_MESSAGES.validate_python(context.get_messages())
    return tuple(TranscriptTurn(message.role, message.content) for message in messages)


async def _say_goodbye_after(max_session_seconds: int, worker: PipelineWorker) -> None:
    """Graceful cap from docs.pipecat.ai/pipecat/learn/pipeline-termination: EndFrame drains the goodbye first."""
    await asyncio.sleep(max_session_seconds)
    logger.info(f"⏰ max session duration ({max_session_seconds}s) reached, saying goodbye")
    await worker.queue_frames([TTSSpeakFrame(_GOODBYE), EndFrame()])


async def run_session(
    transport: BaseTransport,
    request: SessionRequest,
    settings: CloudBotSettings | LocalBotSettings,
    *,
    handle_sigint: bool,
) -> None:
    started_at = datetime.now(UTC)
    logger.info(f"🎬 session {request.session_id} for {request.user_id}")

    stt = DeepgramSTTService(api_key=settings.deepgram_api_key.get_secret_value())
    llm = OpenAILLMService(
        api_key=settings.openai_api_key.get_secret_value(),
        settings=OpenAILLMService.Settings(
            model=settings.openai_model,
            system_instruction=load_system_prompt(settings.profile_dir),
        ),
    )
    tts = CartesiaTTSService(
        api_key=settings.cartesia_api_key.get_secret_value(),
        settings=CartesiaTTSService.Settings(voice=settings.cartesia_voice_id),
    )
    logger.info(f"🧠 LLM: OpenAI {settings.openai_model}")

    context = LLMContext()
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context, user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer())
    )
    recorder = AudioBufferProcessor(
        sample_rate=_RECORDING_SAMPLE_RATE_HZ, num_channels=1, auto_start_recording=True
    )
    audio_capture = AudioCapture()
    recorder.add_event_handler("on_audio_data", audio_capture.on_audio_data)
    usage_observer = ServiceMetricsObserver()
    token_usage_tally = TokenUsageTally()
    usage_observer.add_event_handler("on_service_usage", token_usage_tally.on_service_usage)

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            recorder,
            assistant_aggregator,
        ]
    )
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
        observers=[usage_observer],
        enable_rtvi=True,
        idle_timeout_secs=settings.idle_timeout_seconds,
        cancel_on_idle_timeout=True,
    )

    goodbye: asyncio.Task[None] | None = None

    async def on_client_connected(_transport: BaseTransport, _client: object) -> None:
        nonlocal goodbye
        logger.info("🔌 client connected")
        goodbye = asyncio.create_task(_say_goodbye_after(settings.max_session_seconds, worker))
        context.add_message({"role": "developer", "content": "Start the call by saying hello."})
        await worker.queue_frames([LLMRunFrame()])

    async def on_client_disconnected(_transport: BaseTransport, _client: object) -> None:
        logger.info("👋 client disconnected")
        await worker.cancel()

    async def on_pipeline_finished(_worker: PipelineWorker, _frame: Frame) -> None:
        # Fires for both EndFrame and CancelFrame, so the session is saved exactly once.
        logger.info("🏁 pipeline finished")
        if goodbye is not None:
            goodbye.cancel()
        await recording_store(settings).save(
            SessionRecording(
                request=request,
                started_at=started_at,
                ended_at=datetime.now(UTC),
                token_usage=token_usage_tally.token_usage,
                transcript=transcript(context),
                audio=audio_capture.audio,
            )
        )
        logger.info(f"🗂️ recorded session {request.session_id}")

    transport.add_event_handler("on_client_connected", on_client_connected)
    transport.add_event_handler("on_client_disconnected", on_client_disconnected)
    worker.add_event_handler("on_pipeline_finished", on_pipeline_finished)

    runner = WorkerRunner(handle_sigint=handle_sigint)
    logger.info("🚀 starting pipeline worker")
    await runner.add_workers(worker)
    await runner.run()


_TRANSPORT_PARAMS: dict[str, Callable[[], TransportParams]] = {
    "daily": lambda: DailyParams(audio_in_enabled=True, audio_out_enabled=True),
    "webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True),
}


async def bot(runner_args: RunnerArguments) -> None:
    """Entry point for both the local runner and Pipecat Cloud."""
    settings = load_settings()
    if settings.sentry_dsn is not None:
        init_sentry(settings.sentry_dsn)
    request = parse_session_request(runner_args.body, SessionId(uuid4().hex))
    transport = await create_transport(runner_args, _TRANSPORT_PARAMS)
    await run_session(transport, request, settings, handle_sigint=runner_args.handle_sigint)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
