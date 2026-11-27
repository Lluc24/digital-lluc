import asyncio
import json
import wave
from dataclasses import dataclass
from typing import Annotated, Literal

import httpx
import sentry_sdk
from loguru import logger
from pydantic import (
    BaseModel,
    ConfigDict,
    HttpUrl,
    SecretStr,
    StringConstraints,
    TypeAdapter,
    ValidationError,
)

from digital_lluc.domain import SessionRecording
from digital_lluc.recording_formats import encode_transcript_text, encode_wav, has_spoken_turns
from digital_lluc.slack_text import escape_slack_text

SlackChannelId = Annotated[str, StringConstraints(pattern=r"^[CG][A-Z0-9]+$")]

_SLACK_API_URL = "https://slack.com/api"
# A full-length session's WAV runs to tens of MB; this bounds how long a finished session waits.
_UPLOAD_TIMEOUT_SECONDS = 30.0


@dataclass(frozen=True)
class SlackRecordingChannel:
    """Pre: bot_token has files:write and its app is a member of channel_id."""

    bot_token: SecretStr
    channel_id: SlackChannelId


@dataclass(frozen=True)
class _SlackFile:
    filename: str
    title: str
    content: bytes


class _SlackUploadError(Exception):
    """Slack refused a step; the message holds only the step and Slack's status or error code."""


class _SlackResponse(BaseModel):
    # Pydantic would echo the response, which can hold the visitor email, into the error.
    model_config = ConfigDict(hide_input_in_errors=True)


class _SlackOk(_SlackResponse):
    ok: Literal[True]


class _SlackFailure(_SlackResponse):
    ok: Literal[False]
    error: str


class _UploadUrl(_SlackOk):
    upload_url: HttpUrl
    file_id: str


_UPLOAD_URL_RESPONSE = TypeAdapter(
    _UploadUrl | _SlackFailure, config=ConfigDict(hide_input_in_errors=True)
)
_COMPLETE_UPLOAD_RESPONSE = TypeAdapter(
    _SlackOk | _SlackFailure, config=ConfigDict(hide_input_in_errors=True)
)
type _UploadFailure = (
    httpx.HTTPError | TimeoutError | ValidationError | wave.Error | _SlackUploadError
)


def _session_files(recording: SessionRecording) -> tuple[_SlackFile, ...]:
    session_id = recording.request.session_id
    audio = (
        ()
        if recording.audio is None
        else (_SlackFile("audio.wav", f"Audio {session_id}", encode_wav(recording.audio)),)
    )
    transcript = (
        (
            _SlackFile(
                "transcript.txt", f"Transcript {session_id}", encode_transcript_text(recording)
            ),
        )
        if has_spoken_turns(recording.transcript)
        else ()
    )
    return (*audio, *transcript)


def _session_comment(recording: SessionRecording) -> str:
    visitor = escape_slack_text(recording.request.user_id)
    session_id = escape_slack_text(recording.request.session_id)
    return (
        f"Digital Lluc conversation ended: {visitor}, session {session_id}, "
        f"{recording.duration_seconds}s"
    )


async def _call_slack[ResponseT: _SlackOk](
    client: httpx.AsyncClient,
    channel: SlackRecordingChannel,
    method: str,
    form: dict[str, str],
    response_adapter: TypeAdapter[ResponseT | _SlackFailure],
) -> ResponseT:
    # A form body, not query parameters as slack_sdk sends, keeps the visitor email out of URL logs.
    response = await client.post(
        f"{_SLACK_API_URL}/{method}",
        data=form,
        headers={"Authorization": f"Bearer {channel.bot_token.get_secret_value()}"},
    )
    if response.is_error:
        raise _SlackUploadError(f"{method} answered HTTP {response.status_code}")
    parsed = response_adapter.validate_json(response.content)
    match parsed:
        case _SlackFailure(error=error):
            raise _SlackUploadError(f"{method} answered {error}")
        case _:
            return parsed


async def _upload(
    client: httpx.AsyncClient, channel: SlackRecordingChannel, file: _SlackFile
) -> str:
    """Post: Slack holds file's bytes under the returned file id, not yet shared anywhere."""
    upload_url = await _call_slack(
        client,
        channel,
        "files.getUploadURLExternal",
        {"filename": file.filename, "length": str(len(file.content))},
        _UPLOAD_URL_RESPONSE,
    )
    # The pre-signed URL is the credential here, so no bot token goes with it.
    response = await client.post(str(upload_url.upload_url), content=file.content)
    if response.is_error:
        raise _SlackUploadError(f"file upload answered HTTP {response.status_code}")
    return upload_url.file_id


async def _post_files(
    channel: SlackRecordingChannel, recording: SessionRecording, files: tuple[_SlackFile, ...]
) -> None:
    # trust_env=False, as in slack_activity.py: proxy and CA env vars would make the
    # constructor raise outside HTTPError.
    async with httpx.AsyncClient(trust_env=False) as client:
        file_ids = tuple([await _upload(client, channel, file) for file in files])
        await _call_slack(
            client,
            channel,
            "files.completeUploadExternal",
            {
                "files": json.dumps(
                    [
                        {"id": file_id, "title": file.title}
                        for file_id, file in zip(file_ids, files, strict=True)
                    ]
                ),
                "channel_id": channel.channel_id,
                "initial_comment": _session_comment(recording),
            },
            _COMPLETE_UPLOAD_RESPONSE,
        )


def _failure_summary(error: _UploadFailure) -> str:
    match error:
        case _SlackUploadError():
            return str(error)
        case _:
            return type(error).__name__


async def post_session_recording(
    channel: SlackRecordingChannel, recording: SessionRecording
) -> None:
    """Post: channel holds the recording's audio and spoken transcript, whichever exist, in one
    message naming the visitor and session. Raises nothing and gives up after a bounded time, so a
    failed post never fails a session. Failures are reported without the visitor email."""
    try:
        async with asyncio.timeout(_UPLOAD_TIMEOUT_SECONDS):
            files = _session_files(recording)
            if files:
                await _post_files(channel, recording, files)
                logger.info(f"📣 posted {len(files)} session recording files to Slack")
    except (httpx.HTTPError, TimeoutError, ValidationError, wave.Error, _SlackUploadError) as error:
        logger.warning(f"📣 Slack session recording upload failed: {_failure_summary(error)}")
        sentry_sdk.capture_exception(error)
